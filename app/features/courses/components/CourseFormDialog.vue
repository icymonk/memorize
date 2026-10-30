<script setup lang="ts">
import type { Course } from '../services/courses'
import type { Group } from '~/features/space/services/groups'
import type { Member } from '~/features/space/services/invites'
import { courseInput } from '#shared/schemas/course'
import { toast } from 'vue-sonner'
import { listGroups } from '~/features/space/services/groups'
import { listMembers } from '~/features/space/services/invites'
import { errorMessage } from '~/lib/errors'
import { ko } from '~/locales/ko'
import { saveCourse } from '../services/courses'

/** CRS-01 코스 만들기·수정: 제목·설명·수준·공개 대상·편집 범위 */
const props = defineProps<{ course?: Course | null }>()
const emit = defineEmits<{ saved: [id: string] }>()
const open = defineModel<boolean>('open', { default: false })

const t = ko.courses.form
const space = useSpaceStore()
const auth = useAuthStore()
const { $firestore } = useNuxtApp()
const personal = computed(() => space.current?.kind === 'personal')
const me = computed(() => auth.user!.uid)
const isOwner = computed(() => !props.course || props.course.createdBy === me.value)

const empty = () => ({ title: '', description: '', level: '', visibility: personal.value ? 'private' : 'space', groupIds: [] as string[], editPolicy: 'author', collaboratorIds: [] as string[] })
const form = ref(empty())
const groups = ref<Group[]>([])
const members = ref<Member[]>([])
const saving = ref(false)

watch(open, (v) => {
  if (!v) return
  const c = props.course
  form.value = c
    ? { title: c.title, description: c.description, level: c.level, visibility: c.visibility, groupIds: [...c.groupIds], editPolicy: c.editPolicy, collaboratorIds: [...c.collaboratorIds] }
    : empty()
  if (personal.value) return
  const sid = space.current!.id
  listGroups($firestore, sid).then(g => groups.value = g).catch(() => {})
  listMembers($firestore, sid).then(m => members.value = m.filter(x => x.status === 'active' && x.uid !== me.value)).catch(() => {})
})

function toggle(list: string[], id: string) {
  const i = list.indexOf(id)
  if (i < 0) list.push(id)
  else list.splice(i, 1)
}

async function submit() {
  const parsed = courseInput.safeParse(form.value)
  if (!parsed.success) {
    toast.error(ko.errors.invalidInput)
    return
  }
  saving.value = true
  try {
    const id = await saveCourse($firestore, space.current!.id, me.value, parsed.data, props.course)
    toast.success(t.saved)
    open.value = false
    emit('saved', id)
  }
  catch (e) {
    toast.error(errorMessage(e) ?? ko.errors.unknown)
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[90svh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{{ course ? t.edit : t.create }}</DialogTitle>
      </DialogHeader>
      <form id="course-form" class="flex flex-col gap-4" @submit.prevent="submit">
        <div class="flex flex-col gap-2">
          <Label for="course-title">{{ t.title }}</Label>
          <Input id="course-title" v-model="form.title" maxlength="80" />
        </div>
        <div class="flex flex-col gap-2">
          <Label for="course-desc">{{ t.description }}</Label>
          <Textarea id="course-desc" v-model="form.description" rows="2" maxlength="500" />
        </div>
        <div class="flex flex-col gap-2">
          <Label for="course-level">{{ t.level }}</Label>
          <Input id="course-level" v-model="form.level" maxlength="30" :placeholder="t.levelPlaceholder" />
        </div>
        <fieldset v-if="!personal" :disabled="!isOwner" class="flex flex-col gap-4">
          <p v-if="!isOwner" class="text-muted-foreground text-xs">{{ t.ownerOnly }}</p>
          <div class="flex flex-col gap-2">
            <Label>{{ t.visibility }}</Label>
            <RadioGroup v-model="form.visibility" class="flex flex-wrap gap-4" :aria-label="t.visibility">
              <label v-for="v in (['space', 'group', 'private'] as const)" :key="v" class="flex items-center gap-2 text-sm">
                <RadioGroupItem :value="v" /> {{ t.vis[v] }}
              </label>
            </RadioGroup>
            <div v-if="form.visibility === 'group'" class="flex flex-wrap gap-x-4 gap-y-1 rounded-md border p-2" :aria-label="t.groups">
              <span v-if="!groups.length" class="text-muted-foreground text-xs">{{ t.noGroups }}</span>
              <label v-for="g in groups" :key="g.id" class="flex items-center gap-2 text-sm">
                <input type="checkbox" class="size-4" :checked="form.groupIds.includes(g.id)" @change="toggle(form.groupIds, g.id)"> {{ g.name }}
              </label>
            </div>
          </div>
          <div class="flex flex-col gap-2">
            <Label>{{ t.editPolicy }}</Label>
            <RadioGroup v-model="form.editPolicy" class="flex flex-wrap gap-4" :aria-label="t.editPolicy">
              <label v-for="v in (['author', 'collaborators', 'everyone'] as const)" :key="v" class="flex items-center gap-2 text-sm">
                <RadioGroupItem :value="v" /> {{ t.policy[v] }}
              </label>
            </RadioGroup>
            <div v-if="form.editPolicy === 'collaborators'" class="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border p-2" :aria-label="t.collaborators">
              <label v-for="m in members" :key="m.uid" class="flex items-center gap-2 text-sm">
                <input type="checkbox" class="size-4" :checked="form.collaboratorIds.includes(m.uid)" @change="toggle(form.collaboratorIds, m.uid)"> {{ m.displayName }}
              </label>
            </div>
          </div>
        </fieldset>
      </form>
      <DialogFooter>
        <Button type="submit" form="course-form" :disabled="saving">{{ ko.dialog.ok }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
