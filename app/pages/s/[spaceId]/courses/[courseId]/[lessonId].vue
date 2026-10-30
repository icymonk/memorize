<script setup lang="ts">
import type { LessonLinks } from '#shared/schemas/course'
import type { Course, Lesson } from '~/features/courses/services/courses'
import type { SaveStatus } from '~/features/notes/sync/writer'
import { canEditCourse, LESSON_LINKS_MAX, lessonTitle } from '#shared/schemas/course'
import { ArrowLeftIcon, ArrowRightIcon, LinkIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { getCourse, listLessons, updateLesson } from '~/features/courses/services/courses'
import { listProblemSets } from '~/features/math/services/problemSets'
import BlockEditor from '~/features/notes/components/BlockEditor.vue'
import { listTests } from '~/features/tests/services/tests'
import { listDecks } from '~/features/vocab/services/decks'
import { errorMessage } from '~/lib/errors'
import { ko } from '~/locales/ko'

/** CRS-02·10 레슨: 본문(노트 편집기), 단어장·문제집·시험 연결 */
const t = ko.courses.lesson
const space = useSpaceStore()
const auth = useAuthStore()
const route = useRoute()
const { $firestore } = useNuxtApp()

const sid = computed(() => space.current!.id)
const cid = computed(() => String(route.params.courseId))
const lid = computed(() => String(route.params.lessonId))
const me = computed(() => auth.user!.uid)
const course = ref<Course | null>(null)
const lessons = ref<Lesson[]>([])
const loading = ref(true)
const busy = ref(false)
const title = ref('')
const linksOpen = ref(false)
const status = ref<SaveStatus>('saved')
const draft = ref<LessonLinks>({ linkedDeckIds: [], linkedProblemSetIds: [], linkedTestIds: [] })
const options = ref<{ decks: { id: string, title: string }[], sets: { id: string, title: string }[], tests: { id: string, title: string }[] }>({ decks: [], sets: [], tests: [] })

const lesson = computed(() => lessons.value.find(l => l.id === lid.value) ?? null)
const idx = computed(() => lessons.value.findIndex(l => l.id === lid.value))
const prev = computed(() => lessons.value[idx.value - 1])
const next = computed(() => lessons.value[idx.value + 1])
const canEdit = computed(() => !!course.value && canEditCourse(course.value, me.value))

type Kind = 'decks' | 'sets' | 'tests'
const KINDS: { kind: Kind, key: keyof LessonLinks, path: string }[] = [
  { kind: 'decks', key: 'linkedDeckIds', path: 'decks' },
  { kind: 'sets', key: 'linkedProblemSetIds', path: 'math' },
  { kind: 'tests', key: 'linkedTestIds', path: 'tests' },
]
const linked = computed(() => KINDS.map(k => ({ ...k, items: options.value[k.kind].filter(o => lesson.value?.[k.key].includes(o.id)) })).filter(k => k.items.length))

async function loadOptions() {
  const mods = space.current?.modules
  const [decks, sets, tests] = await Promise.all([
    mods?.vocab ? listDecks($firestore, sid.value, me.value, space.membership?.groupIds ?? []).catch(() => []) : [],
    mods?.math ? listProblemSets($firestore, sid.value, me.value).catch(() => []) : [],
    mods?.tests ? listTests($firestore, sid.value, me.value).then(r => [...new Map([...r.hosting, ...r.taking].map(x => [x.id, x])).values()]).catch(() => []) : [],
  ])
  options.value = {
    decks: decks.map(d => ({ id: d.id, title: d.title })),
    sets: sets.map(s => ({ id: s.id, title: s.title })),
    tests: tests.map(x => ({ id: x.id, title: x.title })),
  }
}

async function load() {
  try {
    const c = await getCourse($firestore, sid.value, cid.value)
    lessons.value = c ? await listLessons($firestore, sid.value, cid.value) : []
    course.value = c
    title.value = lesson.value?.title ?? ''
  }
  catch {
    course.value = null
  }
  finally {
    loading.value = false
  }
}
onMounted(() => Promise.all([load(), loadOptions()]))
watch(lid, () => load())

async function save(patch: Parameters<typeof updateLesson>[4]) {
  busy.value = true
  try {
    await updateLesson($firestore, sid.value, cid.value, lid.value, patch)
    toast.success(t.saved)
    await load()
    return true
  }
  catch (e) {
    toast.error(errorMessage(e) ?? ko.errors.unknown)
    return false
  }
  finally {
    busy.value = false
  }
}

function saveTitle() {
  const p = lessonTitle.safeParse(title.value)
  if (p.success) return save({ title: p.data })
}

function openLinks() {
  const l = lesson.value!
  draft.value = { linkedDeckIds: [...l.linkedDeckIds], linkedProblemSetIds: [...l.linkedProblemSetIds], linkedTestIds: [...l.linkedTestIds] }
  linksOpen.value = true
}

function toggle(key: keyof LessonLinks, id: string) {
  const list = draft.value[key]
  const i = list.indexOf(id)
  if (i >= 0) list.splice(i, 1)
  else if (list.length < LESSON_LINKS_MAX) list.push(id)
}

async function saveLinks() {
  if (await save(draft.value)) linksOpen.value = false
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
    <Button as-child variant="ghost" size="sm" class="self-start">
      <NuxtLink :to="`/s/${sid}/courses/${cid}`"><ArrowLeftIcon /> {{ course?.title ?? ko.courses.course.back }}</NuxtLink>
    </Button>
    <Skeleton v-if="loading" class="h-40 w-full" />
    <p v-else-if="!course || !lesson" class="text-muted-foreground text-sm">{{ t.notFound }}</p>
    <template v-else>
      <form v-if="canEdit" class="flex gap-2" @submit.prevent="saveTitle">
        <Input v-model="title" maxlength="80" class="text-lg font-semibold" :aria-label="t.titleLabel" />
        <Button type="submit" variant="outline" :disabled="busy || !title.trim() || title.trim() === lesson.title">{{ t.saveTitle }}</Button>
      </form>
      <h1 v-else class="text-xl font-semibold">{{ lesson.title }}</h1>

      <section class="flex flex-col gap-2" :aria-label="t.links">
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-sm font-semibold">{{ t.links }}</h2>
          <Button v-if="canEdit" variant="outline" size="sm" @click="openLinks"><LinkIcon /> {{ t.editLinks }}</Button>
        </div>
        <p v-if="!linked.length" class="text-muted-foreground text-sm">{{ t.noLinks }}</p>
        <div v-for="k in linked" :key="k.kind" class="flex flex-wrap items-center gap-2 text-sm">
          <span class="text-muted-foreground w-14">{{ t[k.kind] }}</span>
          <Button v-for="o in k.items" :key="o.id" as-child variant="secondary" size="sm">
            <NuxtLink :to="`/s/${sid}/${k.path}/${o.id}`">{{ o.title }}</NuxtLink>
          </Button>
        </div>
      </section>

      <section :aria-label="t.body" class="flex min-h-40 flex-col gap-1">
        <span v-if="canEdit" class="text-muted-foreground self-end text-xs" aria-live="polite">{{ t.status[status] }}</span>
        <BlockEditor v-if="lesson.bodyPageId" :key="lesson.bodyPageId" :space-id="sid" :page-id="lesson.bodyPageId" :editable="canEdit" @status="status = $event" />
      </section>

      <div class="flex justify-between gap-2">
        <Button v-if="prev" as-child variant="ghost" size="sm">
          <NuxtLink :to="`/s/${sid}/courses/${cid}/${prev.id}`"><ArrowLeftIcon /> {{ t.prev }}</NuxtLink>
        </Button>
        <span v-else />
        <Button v-if="next" as-child variant="ghost" size="sm">
          <NuxtLink :to="`/s/${sid}/courses/${cid}/${next.id}`">{{ t.next }} <ArrowRightIcon /></NuxtLink>
        </Button>
      </div>

      <Dialog v-model:open="linksOpen">
        <DialogContent class="max-h-[90svh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{{ t.editLinks }}</DialogTitle>
          </DialogHeader>
          <div v-for="k in KINDS" :key="k.kind" class="flex flex-col gap-1">
            <Label>{{ t[k.kind] }}</Label>
            <p v-if="!options[k.kind].length" class="text-muted-foreground text-xs">{{ t.none }}</p>
            <div v-else class="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border p-2" :aria-label="t[k.kind]">
              <label v-for="o in options[k.kind]" :key="o.id" class="flex items-center gap-2 text-sm">
                <input type="checkbox" class="size-4" :checked="draft[k.key].includes(o.id)" @change="toggle(k.key, o.id)"> {{ o.title }}
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button :disabled="busy" @click="saveLinks">{{ ko.dialog.ok }}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </template>
  </div>
</template>
