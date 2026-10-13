<script setup lang="ts">
import type { Group } from '~/features/space/services/groups'
import { listGroups } from '~/features/space/services/groups'
import type { MissionInput } from '#shared/schemas/mission'
import type { Mission } from '../services/missions'
import type { Member } from '~/features/space/services/invites'
import { MISSION_TYPES, missionInput, NOTIFY_ON_COMPLETE, RECURRENCE } from '#shared/schemas/mission'
import { toast } from 'vue-sonner'
import { errorMessage } from '~/lib/errors'
import { ko } from '~/locales/ko'
import { createMission, updateMission } from '../services/missions'

/** MIS-10~12·14·17·34: 미션 만들기·수정 */
const props = defineProps<{ mission?: Mission | null, members: Member[], personal: boolean, today: string }>()
const emit = defineEmits<{ saved: [id: string] }>()
const open = defineModel<boolean>('open', { default: false })

const t = ko.missions
const f = t.fields
const space = useSpaceStore()
const auth = useAuthStore()
const { $firestore } = useNuxtApp()

const form = ref<MissionInput>(missionInput.parse({ title: '-', startDate: props.today }))
const pending = ref(false)
const me = computed(() => auth.user?.uid ?? '')
const others = computed(() => props.members.filter(m => m.status === 'active' && m.uid !== (props.mission?.createdBy ?? me.value)))
const activeIds = computed(() => props.members.filter(m => m.status === 'active').map(m => m.uid))
/** WS-32: 그룹 대상 */
const groups = ref<Group[]>([])
const memberGroups = computed(() => Object.fromEntries(props.members.map(m => [m.uid, (m as typeof m & { groupIds?: string[] }).groupIds ?? []])))
const selectClass = 'border-input bg-background h-9 rounded-md border px-3 text-sm'

watch(open, (v) => {
  if (!v) return
  if (space.current?.kind === 'workspace') listGroups($firestore, space.current.id).then(g => groups.value = g).catch(() => {})
  const m = props.mission
  const base = missionInput.parse(m
    ? { ...m, coHostIds: m.hostIds.filter(u => u !== m.createdBy) }
    : { title: '-', startDate: props.today, isPersonal: props.personal, assignees: { all: !props.personal, uids: [] } })
  form.value = { ...base, title: m?.title ?? '' }
})

function toggle(list: string[], x: string) {
  return list.includes(x) ? list.filter(y => y !== x) : [...list, x]
}
function toggleDay(d: number) {
  const w = form.value.recurrence.weekdays
  form.value.recurrence.weekdays = (w.includes(d) ? w.filter(x => x !== d) : [...w, d]).sort()
}
const endDate = computed({
  get: () => form.value.endDate ?? '',
  set: (v: string) => { form.value.endDate = v || null },
})

async function submit() {
  const parsed = missionInput.safeParse(form.value)
  if (!parsed.success) {
    toast.error(ko.errors.invalidInput)
    return
  }
  pending.value = true
  try {
    const sid = space.current!.id
    let id = props.mission?.id
    if (props.mission) await updateMission($firestore, sid, props.mission, parsed.data, activeIds.value, memberGroups.value)
    else id = await createMission($firestore, sid, me.value, parsed.data, activeIds.value, memberGroups.value)
    toast.success(props.mission ? t.saved : t.created)
    open.value = false
    emit('saved', id!)
  }
  catch (e) {
    toast.error(errorMessage(e) ?? ko.errors.unknown)
  }
  finally {
    pending.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[90svh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{{ mission ? t.edit : form.isPersonal ? t.createGoal : t.create }}</DialogTitle>
        <DialogDescription v-if="form.isPersonal">
          {{ f.personalHint }}
        </DialogDescription>
      </DialogHeader>

      <form id="mission-form" class="flex flex-col gap-5" @submit.prevent="submit">
        <div class="flex flex-col gap-2">
          <Label for="mis-title">{{ f.title }}</Label>
          <Input id="mis-title" v-model="form.title" required maxlength="80" :placeholder="f.titlePlaceholder" />
        </div>
        <div class="flex flex-col gap-2">
          <Label for="mis-desc">{{ f.description }}</Label>
          <Textarea id="mis-desc" v-model="form.description" maxlength="2000" rows="3" />
        </div>

        <div class="flex flex-col gap-2">
          <Label>{{ f.type }}</Label>
          <RadioGroup v-model="form.type" class="flex flex-col gap-2">
            <label v-for="x in MISSION_TYPES" :key="x" class="flex items-center gap-2 text-sm">
              <RadioGroupItem :value="x" />
              {{ t.types[x] }}
            </label>
          </RadioGroup>
        </div>

        <div class="flex flex-col gap-2">
          <Label for="mis-rec">{{ f.recurrence }}</Label>
          <select id="mis-rec" v-model="form.recurrence.kind" :class="selectClass">
            <option v-for="x in RECURRENCE" :key="x" :value="x">
              {{ t.recurrences[x] }}
            </option>
          </select>
          <div v-if="form.recurrence.kind === 'weekly'" class="flex gap-1" role="group" :aria-label="f.weekdays">
            <Button
              v-for="(d, i) in t.weekdays" :key="d" type="button" size="sm"
              :variant="form.recurrence.weekdays.includes(i) ? 'default' : 'outline'"
              :aria-pressed="form.recurrence.weekdays.includes(i)" @click="toggleDay(i)"
            >
              {{ d }}
            </Button>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-2">
            <Label for="mis-start">{{ f.startDate }}</Label>
            <Input id="mis-start" v-model="form.startDate" type="date" required />
          </div>
          <div class="flex flex-col gap-2">
            <Label for="mis-end">{{ f.endDate }}</Label>
            <Input id="mis-end" v-model="endDate" type="date" :min="form.startDate" />
          </div>
        </div>
        <label v-if="form.type === 'submission'" class="flex items-center gap-2 text-sm">
          <input v-model="form.allowLate" type="checkbox" class="size-4">
          {{ f.allowLate }}
        </label>

        <template v-if="!form.isPersonal">
          <div class="flex flex-col gap-2">
            <Label>{{ f.assignees }}</Label>
            <RadioGroup :model-value="form.assignees.all ? 'all' : 'pick'" class="flex gap-4" @update:model-value="(v) => form.assignees.all = v === 'all'">
              <label class="flex items-center gap-2 text-sm"><RadioGroupItem value="all" />{{ f.everyone }}</label>
              <label class="flex items-center gap-2 text-sm"><RadioGroupItem value="pick" />{{ f.pick }}</label>
            </RadioGroup>
            <div v-if="!form.assignees.all && groups.length" class="flex flex-wrap gap-x-4 gap-y-1 rounded-md border p-2" :aria-label="f.groups">
              <label v-for="g in groups" :key="g.id" class="flex items-center gap-2 text-sm">
                <input type="checkbox" class="size-4" :checked="form.assignees.groupIds.includes(g.id)" @change="form.assignees.groupIds = toggle(form.assignees.groupIds, g.id)">
                {{ f.groupLabel(g.name) }}
              </label>
            </div>
            <div v-if="!form.assignees.all" class="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border p-2">
              <label v-for="m in others" :key="m.uid" class="flex items-center gap-2 text-sm">
                <input type="checkbox" class="size-4" :checked="form.assignees.uids.includes(m.uid)" @change="form.assignees.uids = toggle(form.assignees.uids, m.uid)">
                {{ m.displayName }}
              </label>
            </div>
            <label class="flex items-center gap-2 text-sm">
              <input v-model="form.includeSelf" type="checkbox" class="size-4">
              {{ f.includeSelf }}
            </label>
            <label class="flex items-center gap-2 text-sm">
              <input v-model="form.joinable" type="checkbox" class="size-4">
              {{ f.joinable }}
            </label>
          </div>

          <div v-for="key in (['coHostIds', 'reviewerIds'] as const)" :key="key" class="flex flex-col gap-2">
            <Label>{{ key === 'coHostIds' ? f.coHosts : f.reviewers }}</Label>
            <div class="flex flex-wrap gap-1">
              <Button
                v-for="m in others" :key="m.uid" type="button" size="sm"
                :variant="form[key].includes(m.uid) ? 'default' : 'outline'"
                :aria-pressed="form[key].includes(m.uid)" @click="form[key] = toggle(form[key], m.uid)"
              >
                {{ m.displayName }}
              </Button>
            </div>
          </div>

          <div class="flex flex-col gap-2">
            <Label for="mis-notify">{{ f.notifyOnComplete }}</Label>
            <select id="mis-notify" v-model="form.notifyOnComplete" :class="selectClass">
              <option v-for="x in NOTIFY_ON_COMPLETE" :key="x" :value="x">
                {{ t.notify[x] }}
              </option>
            </select>
          </div>
        </template>
      </form>

      <DialogFooter>
        <Button type="submit" form="mission-form" :disabled="pending">
          {{ ko.dialog.ok }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
