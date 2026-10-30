<script setup lang="ts">
import type { Course, Lesson } from '~/features/courses/services/courses'
import { canEditCourse, lessonTitle, nextOrder, swapOrder } from '#shared/schemas/course'
import { ArrowDownIcon, ArrowLeftIcon, ArrowUpIcon, PencilIcon, PlusIcon, Trash2Icon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import CourseFormDialog from '~/features/courses/components/CourseFormDialog.vue'
import { addLesson, deleteCourse, getCourse, listLessons, removeLesson, reorderLessons } from '~/features/courses/services/courses'
import { errorMessage } from '~/lib/errors'
import { ko } from '~/locales/ko'

/** CRS-01~03 코스: 레슨 목록·추가·순서 바꾸기·삭제, 코스 수정 */
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

async function load() {
  try {
    const c = await getCourse($firestore, sid.value, cid.value)
    lessons.value = c ? await listLessons($firestore, sid.value, cid.value) : []
    course.value = c
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

      <section class="flex flex-col gap-2" :aria-label="t.lessons">
        <h2 class="text-lg font-semibold">{{ t.lessons }}</h2>
        <p v-if="!lessons.length" class="text-muted-foreground text-sm">{{ t.noLessons }}</p>
        <ol v-else class="flex flex-col divide-y rounded-lg border" data-testid="lesson-list">
          <li v-for="(l, i) in lessons" :key="l.id" class="flex items-center gap-2 p-2">
            <span class="text-muted-foreground w-6 text-center text-sm">{{ i + 1 }}</span>
            <NuxtLink :to="`/s/${sid}/courses/${cid}/${l.id}`" class="min-w-0 flex-1 truncate font-medium hover:underline">{{ l.title }}</NuxtLink>
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
      <CourseFormDialog v-model:open="formOpen" :course="course" @saved="load" />
    </template>
  </div>
</template>
