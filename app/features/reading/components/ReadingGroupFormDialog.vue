<script setup lang="ts">
import type { ScheduleItem } from '#shared/reading-groups'
import type { ShelfItem } from '../services/shelf'
import type { Group } from '~/features/space/services/groups'
import type { Member } from '~/features/space/services/invites'
import { addDays, readingGroupInput } from '#shared/reading-groups'
import { logUnit } from '#shared/schemas/book'
import { toast } from 'vue-sonner'
import { listGroups } from '~/features/space/services/groups'
import { errorMessage } from '~/lib/errors'
import { ko } from '~/locales/ko'
import { createReadingGroup } from '../services/groups'
import ScheduleEditor from './ScheduleEditor.vue'

/** READ-40 함께 읽기 개설: 책(내 책장에서)·기간·대상·열린 모임·챕터 일정 */
const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{ sid: string, members: Member[], shelf: ShelfItem[], today: string }>()
const emit = defineEmits<{ created: [id: string] }>()
const t = ko.reading.groups
const auth = useAuthStore()
const { $firestore } = useNuxtApp()
const selectClass = 'border-input bg-background h-9 rounded-md border px-3 text-sm'

const groups = ref<Group[]>([])
const bookKey = ref('')
const startAt = ref(props.today)
const endAt = ref(addDays(props.today, 27))
const all = ref(true)
const uids = ref<string[]>([])
const groupIds = ref<string[]>([])
const joinable = ref(true)
const schedule = ref<ScheduleItem[]>([])
const pending = ref(false)
const book = computed(() => props.shelf.find(b => b.bookKey === bookKey.value))
const unit = computed(() => (book.value ? logUnit(book.value.format) : 'page'))
const others = computed(() => props.members.filter(m => m.status === 'active' && m.uid !== auth.user?.uid))
const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter(x => x !== id) : [...list, id])

watch(open, (v) => {
  if (!v) return
  bookKey.value = props.shelf[0]?.bookKey ?? ''
  startAt.value = props.today
  endAt.value = addDays(props.today, 27)
  all.value = true
  uids.value = []
  groupIds.value = []
  joinable.value = true
  schedule.value = []
  listGroups($firestore, props.sid).then(g => groups.value = g).catch(() => {})
})

// 책장을 다 불러오기 전에 열었을 때도 첫 책을 고른다
watch(() => props.shelf, (s) => {
  if (!s.some(b => b.bookKey === bookKey.value)) bookKey.value = s[0]?.bookKey ?? ''
})

async function save() {
  const b = book.value
  const p = readingGroupInput.safeParse({
    bookKey: bookKey.value,
    book: b ? { title: b.title, authors: b.authors, cover: b.cover ?? '' } : null,
    unit: unit.value,
    startAt: startAt.value,
    endAt: endAt.value,
    assignees: { all: all.value, uids: all.value ? [] : uids.value, groupIds: all.value ? [] : groupIds.value },
    joinable: joinable.value,
    schedule: schedule.value,
  })
  if (!p.success) {
    toast.error(t.invalid)
    return
  }
  pending.value = true
  try {
    const id = await createReadingGroup($firestore, props.sid, auth.user!.uid, p.data)
    toast.success(t.created)
    open.value = false
    emit('created', id)
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
    <DialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>{{ t.create }}</DialogTitle>
      </DialogHeader>
      <p v-if="!shelf.length" class="text-muted-foreground text-sm">
        {{ t.noBooks }}
      </p>
      <form v-else id="reading-group-form" class="flex flex-col gap-4" @submit.prevent="save">
        <div class="flex flex-col gap-1.5">
          <Label for="rg-book">{{ t.book }}</Label>
          <select id="rg-book" v-model="bookKey" :class="selectClass">
            <option v-for="b in shelf" :key="b.bookKey" :value="b.bookKey">
              {{ b.title }}
            </option>
          </select>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div class="flex flex-col gap-1.5">
            <Label for="rg-start">{{ t.start }}</Label>
            <Input id="rg-start" v-model="startAt" type="date" />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label for="rg-end">{{ t.end }}</Label>
            <Input id="rg-end" v-model="endAt" type="date" :min="startAt" />
          </div>
        </div>
        <fieldset class="flex flex-col gap-2">
          <legend class="mb-1 text-sm font-medium">
            {{ t.assignees }}
          </legend>
          <div class="flex gap-4 text-sm">
            <label class="flex items-center gap-2"><input v-model="all" type="radio" :value="true" class="size-4">{{ t.all }}</label>
            <label class="flex items-center gap-2"><input v-model="all" type="radio" :value="false" class="size-4">{{ t.pick }}</label>
          </div>
          <div v-if="!all && groups.length" class="flex flex-wrap gap-x-4 gap-y-1 rounded-md border p-2" :aria-label="t.groupsLabel">
            <label v-for="g in groups" :key="g.id" class="flex items-center gap-2 text-sm">
              <input type="checkbox" class="size-4" :checked="groupIds.includes(g.id)" @change="groupIds = toggle(groupIds, g.id)">{{ g.name }}
            </label>
          </div>
          <div v-if="!all" class="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border p-2">
            <label v-for="m in others" :key="m.uid" class="flex items-center gap-2 text-sm">
              <input type="checkbox" class="size-4" :checked="uids.includes(m.uid)" @change="uids = toggle(uids, m.uid)">{{ m.displayName }}
            </label>
          </div>
          <label class="flex items-center gap-2 text-sm"><input id="rg-joinable" v-model="joinable" type="checkbox" class="size-4">{{ t.joinable }}</label>
        </fieldset>
        <div class="flex flex-col gap-1.5">
          <span class="text-sm font-medium">{{ t.schedule }}</span>
          <ScheduleEditor v-model="schedule" :start-at="startAt" :end-at="endAt" :unit="unit" />
        </div>
      </form>
      <DialogFooter>
        <Button type="submit" form="reading-group-form" :disabled="pending || !book">
          {{ t.save }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
