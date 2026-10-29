<script setup lang="ts">
import type { KeyValue, ProblemView } from '#shared/math/solve'
import type { ProblemSet } from '~/features/math/services/problemSets'
import type { Question } from '~/features/tests/services/questions'
import { ArrowLeftIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, LightbulbIcon, RotateCcwIcon, XIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import AttachmentList from '~/features/files/components/AttachmentList.vue'
import MathText from '~/features/math/components/MathText.vue'
import { hasTex } from '~/features/math/lib/tex'
import { getProblemSet } from '~/features/math/services/problemSets'
import { getProblemNote, PROBLEM_NOTE_MAX, saveProblemNote } from '~/features/math/services/solve'
import { getQuestions } from '~/features/tests/services/questions'
import { errorMessage } from '~/lib/errors'
import { callFn } from '~/lib/functions'
import { ko } from '~/locales/ko'

/** MATH-20~24 문제집 풀기: 한 문제씩 바로 채점, 힌트 한 단계씩, 맞히거나 포기하면 해설, 풀이 메모 */
const t = ko.math.solve
const ox = ko.exams.take.ox
const route = useRoute()
const space = useSpaceStore()
const auth = useAuthStore()
const { $firestore, $functions } = useNuxtApp()

if (!space.current?.modules?.math || !space.current?.modules?.tests) {
  await navigateTo(`/s/${space.current!.id}/math`, { replace: true })
}

const sid = computed(() => space.current!.id)
const setId = computed(() => String(route.params.setId))
const uid = computed(() => auth.user!.uid)
const set = ref<ProblemSet | null>(null)
const questions = ref<Question[]>([])
const loading = ref(true)
const idx = ref(0)
const views = ref<Record<string, ProblemView>>({})
const answers = ref<Record<string, KeyValue[] | KeyValue>>({})
const busy = ref(false)
const failed = ref(false)
const note = ref('')
const noteSaved = ref('')
const noteBusy = ref(false)

const current = computed(() => questions.value[idx.value])
const view = computed(() => (current.value ? views.value[current.value.id] : undefined))
const ref_ = (questionId: string) => ({ spaceId: sid.value, setId: setId.value, questionId })
const correctCount = computed(() => Object.values(views.value).filter(v => v.correct).length)

async function draw(qid: string, fresh = false) {
  failed.value = false
  try {
    const v = await callFn($functions, 'drawProblem', { ...ref_(qid), fresh })
    views.value[qid] = v
    if (fresh || answers.value[qid] === undefined) answers.value[qid] = fresh ? empty(v) : (v.done || v.tries ? (v.lastAnswer ?? empty(v)) : empty(v))
  }
  catch (e) {
    failed.value = true
    toast.error(errorMessage(e) ?? t.loadFailed)
  }
}
function empty(v: ProblemView): KeyValue[] | KeyValue {
  return v.type === 'single' || v.type === 'multi' ? [] : ''
}

async function loadNote(qid: string) {
  note.value = ''
  noteSaved.value = ''
  const n = await getProblemNote($firestore, sid.value, uid.value, qid).catch(() => null)
  if (current.value?.id === qid) {
    note.value = n?.text ?? ''
    noteSaved.value = note.value
  }
}

onMounted(async () => {
  try {
    set.value = await getProblemSet($firestore, sid.value, setId.value)
    if (set.value) questions.value = (await getQuestions($firestore, sid.value, set.value.questionIds)).list
  }
  finally {
    loading.value = false
  }
})
watch(current, (q) => {
  if (!q) return
  if (!views.value[q.id]) void draw(q.id)
  void loadNote(q.id)
}, { immediate: true })

function answered(v: unknown) {
  return Array.isArray(v) ? v.length > 0 : typeof v === 'string' ? v.trim() !== '' : typeof v === 'boolean'
}
const picked = (i: number) => Array.isArray(answers.value[current.value!.id]) && (answers.value[current.value!.id] as number[]).includes(i)
function pick(i: number) {
  const id = current.value!.id
  const cur = (answers.value[id] as number[] | undefined) ?? []
  answers.value[id] = view.value!.type === 'single' ? [i] : cur.includes(i) ? cur.filter(x => x !== i) : [...cur, i].sort()
}
function answerText(v: ProblemView) {
  const a = v.answer ?? []
  if (v.type === 'single' || v.type === 'multi') return a.map(i => v.choices[Number(i)] ?? '').join(', ')
  if (v.type === 'ox') return ox[String(a[0])] ?? ''
  return a.join(', ')
}

async function act(fn: () => Promise<void>) {
  busy.value = true
  try {
    await fn()
  }
  catch (e) {
    toast.error(errorMessage(e) ?? ko.errors.unknown)
  }
  finally {
    busy.value = false
  }
}
const check = () => act(async () => {
  const id = current.value!.id
  const r = await callFn($functions, 'checkProblem', { ...ref_(id), answer: answers.value[id] as number[] | boolean | string })
  views.value[id] = { ...views.value[id]!, ...r }
  if (r.done) await refreshHints(id)
})
async function giveUp() {
  if (!(await confirmDialog(t.giveUpConfirm))) return
  await act(async () => {
    const id = current.value!.id
    const r = await callFn($functions, 'checkProblem', { ...ref_(id), giveUp: true })
    views.value[id] = { ...views.value[id]!, ...r }
    await refreshHints(id)
  })
}
async function refreshHints(id: string) {
  if (!views.value[id]?.hintCount) return
  const h = await callFn($functions, 'revealHint', ref_(id))
  views.value[id] = { ...views.value[id]!, hints: h.hints }
}
const hint = () => act(() => refreshHints(current.value!.id))
const retry = () => act(() => draw(current.value!.id, true))
const saveNote = () => {
  noteBusy.value = true
  const id = current.value!.id
  const text = note.value
  saveProblemNote($firestore, sid.value, uid.value, id, text)
    .then(() => {
      noteSaved.value = text
      toast.success(t.noteSaved)
    })
    .catch(e => toast.error(errorMessage(e) ?? ko.errors.unknown))
    .finally(() => (noteBusy.value = false))
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
    <div class="flex items-center gap-2">
      <Button variant="ghost" size="icon" class="size-8" as-child :aria-label="t.back">
        <NuxtLink :to="`/s/${sid}/math/${setId}`"><ArrowLeftIcon /></NuxtLink>
      </Button>
      <h1 class="flex-1 truncate text-xl font-semibold">{{ set ? t.title(set.title) : '' }}</h1>
    </div>
    <Skeleton v-if="loading" class="h-40 w-full" />
    <p v-else-if="!set" class="text-muted-foreground text-sm">{{ ko.math.set.notFound }}</p>
    <p v-else-if="!questions.length" class="text-muted-foreground text-sm">{{ t.empty }}</p>
    <template v-else>
      <nav class="flex flex-wrap gap-1" :aria-label="t.nth(idx + 1, questions.length)">
        <Button
          v-for="(q, i) in questions" :key="q.id" size="icon" class="size-8"
          :variant="i === idx ? 'default' : 'outline'"
          :class="i !== idx && views[q.id]?.correct ? 'border-green-600 text-green-700' : i !== idx && views[q.id]?.gaveUp ? 'text-muted-foreground' : ''"
          :aria-current="i === idx ? 'step' : undefined"
          @click="idx = i"
        >{{ i + 1 }}</Button>
      </nav>

      <Card>
        <CardHeader class="flex flex-row flex-wrap items-center gap-2">
          <CardTitle class="text-base">{{ t.nth(idx + 1, questions.length) }}</CardTitle>
          <Badge v-if="view?.variant" variant="secondary">{{ ko.math.variant.badge }}</Badge>
          <Badge v-if="view?.isPractice" variant="outline" :title="t.practiceHint">{{ t.practice }}</Badge>
        </CardHeader>
        <CardContent class="flex flex-col gap-3">
          <Skeleton v-if="!view && !failed" class="h-24 w-full" />
          <p v-else-if="!view" class="text-destructive text-sm">{{ t.loadFailed }}</p>
          <template v-else>
            <p class="whitespace-pre-line" data-testid="solve-prompt"><MathText :text="view.prompt" /></p>
            <AttachmentList v-if="view.media.length" :files="view.media" />

            <div v-if="view.type === 'single' || view.type === 'multi'" class="flex flex-col gap-1" role="group" :aria-label="view.prompt">
              <label v-for="(c, i) in view.choices" :key="i" class="hover:bg-muted/50 flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm" :class="picked(i) ? 'border-primary bg-primary/5' : ''">
                <input :type="view.type === 'single' ? 'radio' : 'checkbox'" class="size-4" :name="view.questionId" :checked="picked(i)" :disabled="view.done" @change="pick(i)">
                <MathText :text="c" />
              </label>
            </div>
            <div v-else-if="view.type === 'ox'" class="flex gap-2">
              <Button v-for="v in [true, false]" :key="String(v)" type="button" class="w-16 text-lg" :disabled="view.done" :variant="answers[view.questionId] === v ? 'default' : 'outline'" @click="answers[view.questionId] = v">{{ ox[String(v)] }}</Button>
            </div>
            <Input v-else-if="view.type === 'short'" :model-value="String(answers[view.questionId] ?? '')" :disabled="view.done" :placeholder="ko.exams.take.shortPlaceholder" :aria-label="ko.exams.take.shortPlaceholder" @update:model-value="v => answers[view!.questionId] = String(v)" @keydown.enter.prevent="!busy && answered(answers[view.questionId]) && check()" />
            <Textarea v-else :model-value="String(answers[view.questionId] ?? '')" rows="4" :disabled="view.done" :placeholder="ko.exams.take.essayPlaceholder" :aria-label="ko.exams.take.essayPlaceholder" @update:model-value="v => answers[view!.questionId] = String(v)" />

            <ol v-if="view.hints.length" class="flex flex-col gap-1">
              <li v-for="(h, i) in view.hints" :key="i" class="flex gap-2 rounded-md bg-amber-50 p-2 text-sm dark:bg-amber-950/40">
                <LightbulbIcon class="mt-0.5 size-4 shrink-0 text-amber-600" />
                <span><span class="font-medium">{{ t.hintN(i + 1) }}.</span> <MathText :text="h" /></span>
              </li>
            </ol>

            <div v-if="!view.done" class="flex flex-wrap items-center gap-2">
              <Button :disabled="busy || !answered(answers[view.questionId])" @click="check">{{ t.check }}</Button>
              <Button v-if="view.hintCount > view.hints.length" variant="outline" :disabled="busy" @click="hint"><LightbulbIcon /> {{ t.hint(view.hints.length + 1, view.hintCount) }}</Button>
              <Button variant="ghost" :disabled="busy" @click="giveUp">{{ t.giveUp }}</Button>
              <p v-if="view.tries" class="text-destructive flex items-center gap-1 text-sm" role="status"><XIcon class="size-4" /> {{ t.wrong(view.tries) }}</p>
            </div>
            <div v-else class="bg-muted/50 flex flex-col gap-2 rounded-md p-3 text-sm" role="status">
              <p v-if="view.correct" class="flex items-center gap-1 font-medium text-green-700"><CheckIcon class="size-4" /> {{ t.correct }}<template v-if="view.score != null && view.score < 100"> · {{ t.score(view.score) }}</template></p>
              <p v-else-if="view.gaveUp" class="text-muted-foreground font-medium">{{ t.gaveUp }}</p>
              <p v-else class="text-muted-foreground">{{ t.essayDone }}</p>
              <p v-if="view.type !== 'essay'"><MathText :text="t.answerIs(answerText(view))" /></p>
              <div v-if="view.explanation" class="flex flex-col gap-1">
                <p class="font-medium">{{ t.explanation }}</p>
                <p class="whitespace-pre-line"><MathText :text="view.explanation" /></p>
              </div>
              <div class="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" :disabled="busy" @click="retry"><RotateCcwIcon /> {{ view.variant ? t.retryVariant : t.retry }}</Button>
                <Button v-if="idx < questions.length - 1" size="sm" @click="idx++">{{ t.next }} <ChevronRightIcon /></Button>
              </div>
            </div>
          </template>
        </CardContent>
      </Card>

      <div class="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" :disabled="idx === 0" @click="idx--"><ChevronLeftIcon /> {{ t.prev }}</Button>
        <span class="text-muted-foreground text-sm">{{ t.finished(correctCount, questions.length) }}</span>
        <Button variant="ghost" size="sm" :disabled="idx >= questions.length - 1" @click="idx++">{{ t.next }} <ChevronRightIcon /></Button>
      </div>

      <section class="flex flex-col gap-2">
        <Label for="solve-note">{{ t.note }}</Label>
        <Textarea id="solve-note" v-model="note" rows="3" :maxlength="PROBLEM_NOTE_MAX" :placeholder="t.notePlaceholder" />
        <div v-if="hasTex(note)" class="bg-muted/40 rounded-md p-2 text-sm whitespace-pre-line"><MathText :text="note" /></div>
        <Button size="sm" variant="outline" class="self-start" :disabled="noteBusy || note === noteSaved" @click="saveNote">{{ t.noteSave }}</Button>
      </section>
    </template>
  </div>
</template>
