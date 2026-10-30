<script setup lang="ts">
import type { Course, Lesson, LessonProgress } from '~/features/courses/services/courses'
import type { Member } from '~/features/space/services/invites'
import { canEditCourse, courseProgress, lessonTitle, nextOrder, swapOrder } from '#shared/schemas/course'
import { ArrowDownIcon, CheckIcon, ArrowLeftIcon, ArrowUpIcon, PencilIcon, PlusIcon, Trash2Icon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import CourseFormDialog from '~/features/courses/components/CourseFormDialog.vue'
import { addLesson, deleteCourse, getCourse, listLessons, listMyProgress, listSharedProgress, removeLesson, reorderLessons } from '~/features/courses/services/courses'
import { listMembers } from '~/features/space/services/invites'
import { errorMessage } from '~/lib/errors'
import { ko } from '~/locales/ko'

/** CRS-01~03·22 코스: 레슨 목록·추가·순서 바꾸기·삭제, 코스 수정, 내 진도·멤버 진도 */
const t = ko.courses.course
const space = useSpaceStore()
const auth = useAuthStore()
const route = useRoute()
const { $firestore } = useNuxtApp()

const sid = computed(() => space.current!.id)
const cid = computed(() => String(route.params.courseId))
const me = computed(() => auth.user!.uid)
const course = ref<Course | null>(null)
const lessons = ref<Lesson[]>([])
const loading = ref(true)
const busy = ref(false)
const newTitle = ref('')
const formOpen = ref(false)
const canEdit = computed(() => !!course.value && canEditCourse(course.value, me.value))
const canRemove = computed(() => course.value?.createdBy === me.value)
const mine = ref<LessonProgress[]>([])
const shared = ref<LessonProgress[]>([])
const members = ref<Member[]>([])
const lessonIds = computed(() => lessons.value.map(l => l.id))
const doneIds = computed(() => new Set(mine.value.filter(p => p.completedAt).map(p => p.lessonId)))
const myProgress = computed(() => courseProgress(lessonIds.value, doneIds.value))
const memberProgress = computed(() => members.value
  .filter(m => m.status === 'active' && !m.hideProgress && m.uid !== me.value)
  .map(m => ({ uid: m.uid, name: m.displayName, ...courseProgress(lessonIds.value, shared.value.filter(p => p.uid === m.uid && p.completedAt).map(p => p.lessonId)) }))
  .filter(m => m.done > 0)
  .sort((a, b) => b.pct - a.pct))

async function load() {
  try {
    const c = await getCourse($firestore, sid.value, cid.value)
    lessons.value = c ? await listLessons($firestore, sid.value, cid.value) : []
    course.value = c
    if (c) {
      const personal = space.current?.kind === 'personal'
      ;[mine.value, shared.value, members.value] = await Promise.all([
        listMyProgress($firestore, sid.value, me.value, cid.value).catch(() => []),
        personal ? [] : listSharedProgress($firestore, sid.value, cid.value).catch(() => []),
        personal ? [] : listMembers($firestore, sid.value).catch(() => []),
      ])
    }
  }
  catch {
    course.value = null
  }
  finally {
    loading.value = false
  }
}
onMounted(load)

async function run(fn: () => Promise<unknown>) {
  busy.value = true
  try {
    await fn()
    await load()
  }
  catch (e) {
    toast.error(errorMessage(e) ?? ko.errors.unknown)
  }
  finally {
    busy.value = false
  }
}

function add() {
  const p = lessonTitle.safeParse(newTitle.value)
  if (!p.success || !course.value) return
  return run(async () => {
    await addLesson($firestore, sid.value, me.value, course.value!, p.data, nextOrder(lessons.value), space.current?.kind === 'personal')
    newTitle.value = ''
  })
}

function move(id: string, dir: -1 | 1) {
  const pairs = swapOrder(lessons.value, id, dir)
  if (pairs) return run(() => reorderLessons($firestore, sid.value, cid.value, pairs))
}

async function dropLesson(l: Lesson) {
  if (!(await confirmDialog(t.removeLessonConfirm(l.title), { destructive: true }))) return
  await run(() => removeLesson($firestore, sid.value, cid.value, l.id))
}

async function remove() {
  if (!(await confirmDialog(t.removeConfirm, { destructive: true }))) return
  busy.value = true
  try {
    await deleteCourse($firestore, sid.value, cid.value)
    await navigateTo(`/s/${sid.value}/courses`)
  }
  catch (e) {
    toast.error(errorMessage(e) ?? ko.errors.unknown)
    busy.value = false
  }
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
    <Button as-child variant="ghost" size="sm" class="self-start">
      <NuxtLink :to="`/s/${sid}/courses`"><ArrowLeftIcon /> {{ t.back }}</NuxtLink>
    </Button>
    <Skeleton v-if="loading" class="h-32 w-full" />
    <p v-else-if="!course" class="text-muted-foreground text-sm">{{ t.notFound }}</p>
    <template v-else>
      <div class="flex items-start justify-between gap-2">
        <div class="flex min-w-0 flex-col gap-1">
          <h1 class="text-xl font-semibold">{{ course.title }}</h1>
          <p v-if="course.description" class="text-muted-foreground text-sm whitespace-pre-line">{{ course.description }}</p>
          <div class="flex gap-2 text-xs">
            <Badge v-if="course.level" variant="outline">{{ course.level }}</Badge>
            <Badge variant="secondary">{{ ko.courses.form.vis[course.visibility] }}</Badge>
          </div>
        </div>
        <div class="flex shrink-0 gap-1">
          <Button v-if="canEdit" variant="outline" size="sm" @click="formOpen = true"><PencilIcon /> {{ t.edit }}</Button>
          <Button v-if="canRemove" variant="ghost" size="sm" :disabled="busy" @click="remove"><Trash2Icon /> {{ t.remove }}</Button>
        </div>
      </div>

      <div v-if="lessons.length" class="flex flex-col gap-1" data-testid="my-progress">
        <div class="flex justify-between text-sm">
          <span class="font-medium">{{ t.myProgress }}</span>
          <span class="text-muted-foreground">{{ t.progress(myProgress.done, myProgress.total) }} · {{ myProgress.pct }}%</span>
        </div>
        <div class="bg-muted h-2 overflow-hidden rounded-full"><div class="bg-primary h-full" :style="{ width: `${myProgress.pct}%` }" /></div>
      </div>

      <section class="flex flex-col gap-2" :aria-label="t.lessons">
        <h2 class="text-lg font-semibold">{{ t.lessons }}</h2>
        <p v-if="!lessons.length" class="text-muted-foreground text-sm">{{ t.noLessons }}</p>
        <ol v-else class="flex flex-col divide-y rounded-lg border" data-testid="lesson-list">
          <li v-for="(l, i) in lessons" :key="l.id" class="flex items-center gap-2 p-2">
            <span class="text-muted-foreground w-6 text-center text-sm">{{ i + 1 }}</span>
            <NuxtLink :to="`/s/${sid}/courses/${cid}/${l.id}`" class="min-w-0 flex-1 truncate font-medium hover:underline">{{ l.title }}</NuxtLink>
            <Badge v-if="doneIds.has(l.id)" variant="secondary"><CheckIcon /> {{ t.done }}</Badge>
            <template v-if="canEdit">
              <Button variant="ghost" size="icon" :disabled="busy || i === 0" :aria-label="`${l.title} ${t.up}`" @click="move(l.id, -1)"><ArrowUpIcon /></Button>
              <Button variant="ghost" size="icon" :disabled="busy || i === lessons.length - 1" :aria-label="`${l.title} ${t.down}`" @click="move(l.id, 1)"><ArrowDownIcon /></Button>
              <Button variant="ghost" size="icon" :disabled="busy" :aria-label="`${l.title} ${t.removeLesson}`" @click="dropLesson(l)"><Trash2Icon /></Button>
            </template>
          </li>
        </ol>
        <form v-if="canEdit" class="flex gap-2" @submit.prevent="add">
          <Input v-model="newTitle" maxlength="80" :placeholder="t.newLesson" :aria-label="t.newLesson" />
          <Button type="submit" :disabled="busy || !newTitle.trim()"><PlusIcon /> {{ t.addLesson }}</Button>
        </form>
      </section>
      <section v-if="space.current?.kind !== 'personal' && lessons.length" class="flex flex-col gap-2" :aria-label="t.memberProgress">
        <h2 class="text-lg font-semibold">{{ t.memberProgress }}</h2>
        <p v-if="!memberProgress.length" class="text-muted-foreground text-sm">{{ t.noMembers }}</p>
        <ul v-else class="flex flex-col gap-2" data-testid="member-progress">
          <li v-for="m in memberProgress" :key="m.uid" class="flex items-center gap-3 text-sm">
            <span class="w-28 truncate">{{ m.name }}</span>
            <div class="bg-muted h-2 flex-1 overflow-hidden rounded-full"><div class="bg-primary h-full" :style="{ width: `${m.pct}%` }" /></div>
            <span class="text-muted-foreground w-24 text-right text-xs">{{ m.done }}/{{ m.total }} · {{ m.pct }}%</span>
          </li>
        </ul>
      </section>
      <CourseFormDialog v-model:open="formOpen" :course="course" @saved="load" />
    </template>
  </div>
</template>
