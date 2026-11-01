<script setup lang="ts">
import type { CheckAnswerOutput, PaperItem, SubmitAttemptOutput } from '#shared/schemas/test'
import type { Attempt, AttemptResult } from '~/features/tests/services/attempts'
import type { Test } from '~/features/tests/services/tests'
import { canStart } from '#shared/schemas/test'
import { ArrowLeftIcon, CheckIcon, XIcon } from '@lucide/vue'
import { useDebounceFn, useIntervalFn } from '@vueuse/core'
import { doc, getDoc } from 'firebase/firestore'
import { toast } from 'vue-sonner'
import { getPaper, getResult, myAttempts, saveAnswers } from '~/features/tests/services/attempts'
import { getTest } from '~/features/tests/services/tests'
import MathText from '~/features/math/components/MathText.vue'
import { errorMessage } from '~/lib/errors'
import { callFn } from '~/lib/functions'
import { ko } from '~/locales/ko'

/** TST-20~23 응시: 안내 → 풀기(자동 저장, 남은 시간) → 제출·결과. TST-17 연습 모드 */
definePageMeta({ key: r => r.fullPath })
const t = ko.exams
const k = t.take
const route = useRoute()
const space = useSpaceStore()
const auth = useAuthStore()
const { $firestore, $functions } = useNuxtApp()
const sid = space.current!.id
const tid = String(route.params.testId)
const uid = auth.user!.uid

const test = ref<Test | null>(null)
const paper = ref<PaperItem[]>([])
const history = ref<Attempt[]>([])
const results = ref<Record<string, AttemptResult | null>>({})
const phase = ref<'intro' | 'taking' | 'done'>('intro')
const attempt = ref<Attempt | null>(null)
const answers = ref<Record<string, unknown>>({})
const checked = ref<Record<string, CheckAnswerOutput>>({})
const outcome = ref<SubmitAttemptOutput | null>(null)
const doneResult = ref<AttemptResult | null>(null)
const offset = ref(0)
const now = ref(Date.now())
const saveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const busy = ref(false)
const loading = ref(true)

const isHost = computed(() => !!test.value?.hostIds.includes(uid))
const byId = computed(() => new Map(paper.value.map(p => [p.questionId, p])))
const items = computed(() => (attempt.value?.order ?? []).map(id => byId.value.get(id)).filter((x): x is PaperItem => !!x))
const used = computed(() => history.value.filter(a => !a.isPractice && a.submittedAt).length)
const unfinished = computed(() => history.value.find(a => !a.submittedAt) ?? null)
const startState = computed(() => test.value ? canStart(test.value, used.value, Date.now()) : 'notOpen')
const deadline = computed(() => attempt.value?.deadlineAt?.toMillis() ?? null)
const remainingMs = computed(() => deadline.value == null ? null : Math.max(0, deadline.value - (now.value + offset.value)))
const unanswered = computed(() => items.value.filter(i => !answered(answers.value[i.questionId])).length)

const fmtLeft = (ms: number) => {
  const s = Math.ceil(ms / 1000)
  const h = Math.floor(s / 3600)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0')
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}
function answered(v: unknown) {
  return Array.isArray(v) ? v.length > 0 : typeof v === 'string' ? v.trim() !== '' : typeof v === 'boolean'
}
function choiceIdx(it: PaperItem) {
  return attempt.value?.choiceOrder?.[it.questionId] ?? it.choices.map((_, i) => i)
}
function answerText(it: PaperItem, a: (number | boolean | string)[]) {
  if (it.type === 'single' || it.type === 'multi') return a.map(i => it.choices[Number(i)] ?? '').join(', ')
  if (it.type === 'ox') return k.ox[String(a[0])] ?? ''
  return a.join(', ')
}

async function load() {
  try {
    const tst = await getTest($firestore, sid, tid)
    if (!tst) throw new Error('missing')
    test.value = tst
    const [p, h] = await Promise.all([getPaper($firestore, sid, tid).catch(() => null), myAttempts($firestore, sid, tid, uid)])
    paper.value = p ?? []
    history.value = h
    const done = h.filter(a => a.submittedAt)
    const rs = await Promise.all(done.map(a => getResult($firestore, sid, tid, a.id)))
    results.value = Object.fromEntries(done.map((a, i) => [a.id, rs[i] ?? null]))
  }
  catch {
    toast.error(t.loadFailed)
  }
  finally {
    loading.value = false
  }
}
onMounted(load)

const { pause, resume } = useIntervalFn(() => {
  now.value = Date.now()
  if (phase.value === 'taking' && remainingMs.value === 0 && !busy.value) submit(true)
}, 1000, { immediate: false })
onBeforeUnmount(pause)

const persist = async () => {
  if (!attempt.value || attempt.value.submittedAt) return
  saveState.value = 'saving'
  try {
    await saveAnswers($firestore, sid, tid, attempt.value.id, answers.value)
    saveState.value = 'saved'
  }
  catch {
    saveState.value = 'error'
  }
}
const debouncedSave = useDebounceFn(persist, 800)
watch(answers, () => {
  if (phase.value === 'taking') debouncedSave()
}, { deep: true })

async function start() {
  busy.value = true
  try {
    const res = await callFn($functions, 'startAttempt', { spaceId: sid, testId: tid })
    offset.value = res.nowMs - Date.now()
    const s = await getDoc(doc($firestore, 'spaces', sid, 'tests', tid, 'attempts', res.attemptId))
    attempt.value = { id: s.id, ...s.data() } as Attempt
    if (!paper.value.length) paper.value = (await getPaper($firestore, sid, tid)) ?? []
    answers.value = { ...attempt.value.answers }
    checked.value = {}
    phase.value = 'taking'
    saveState.value = 'idle'
    now.value = Date.now()
    resume()
  }
  catch (e) {
    const code = errorMessage(e)
    toast.error(code ?? ko.errors.unknown)
  }
  finally {
    busy.value = false
  }
}

function setSingle(it: PaperItem, i: number) {
  answers.value[it.questionId] = [i]
}
function toggleMulti(it: PaperItem, i: number) {
  const cur = (answers.value[it.questionId] as number[] | undefined) ?? []
  answers.value[it.questionId] = cur.includes(i) ? cur.filter(x => x !== i) : [...cur, i]
}
const isPicked = (it: PaperItem, i: number) => ((answers.value[it.questionId] as number[] | undefined) ?? []).includes(i)

async function check(it: PaperItem) {
  await persist()
  try {
    checked.value[it.questionId] = await callFn($functions, 'checkAnswer', { spaceId: sid, testId: tid, attemptId: attempt.value!.id, questionId: it.questionId })
  }
  catch (e) {
    toast.error(errorMessage(e) ?? ko.errors.unknown)
  }
}

async function submit(auto = false) {
  if (!attempt.value) return
  if (!auto && !(await confirmDialog(k.submitConfirm(unanswered.value)))) return
  busy.value = true
  pause()
  try {
    await persist()
    outcome.value = await callFn($functions, 'submitAttempt', { spaceId: sid, testId: tid, attemptId: attempt.value.id })
    doneResult.value = await getResult($firestore, sid, tid, attempt.value.id)
    toast.success(auto ? k.timeUp : k.submitted)
    phase.value = 'done'
    await load()
  }
  catch (e) {
    toast.error(errorMessage(e) ?? ko.errors.unknown)
    if (!auto) resume()
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 md:p-6">
    <div class="flex items-center gap-2">
      <Button variant="ghost" size="icon" class="size-8" as-child :aria-label="k.back">
        <NuxtLink :to="`/s/${sid}/tests/${tid}`"><ArrowLeftIcon /></NuxtLink>
      </Button>
      <h1 class="flex-1 truncate text-xl font-semibold">{{ test?.title }}</h1>
      <template v-if="phase === 'taking'">
        <span v-if="remainingMs != null" class="font-mono text-sm tabular-nums" :class="remainingMs < 60_000 ? 'text-destructive' : ''">{{ k.remaining(fmtLeft(remainingMs)) }}</span>
      </template>
    </div>
    <p v-if="loading" class="text-muted-foreground text-sm">{{ t.loading }}</p>

    <template v-else-if="test && phase === 'intro'">
      <p v-if="test.description" class="text-sm whitespace-pre-line">{{ test.description }}</p>
      <ul class="text-muted-foreground flex flex-col gap-1 text-sm">
        <li>{{ t.info(test.questionRefs.length, test.maxScore ?? 0) }} · {{ test.settings.timeLimitMin ? t.minutes(test.settings.timeLimitMin) : t.noTimeLimit }}</li>
        <li v-if="!test.settings.practice && !isHost">{{ k.used(used, test.settings.maxAttempts) }}</li>
        <li>{{ t.fields.resultRelease }}: {{ t.release[test.settings.resultRelease] }}</li>
      </ul>
      <div class="flex items-center gap-2">
        <Button :disabled="busy || (!isHost && !unfinished && startState !== 'ok')" @click="start">
          {{ unfinished ? k.resume : isHost ? k.hostPreview : test.settings.practice ? k.practice : k.start }}
        </Button>
        <span v-if="!isHost && !unfinished && startState !== 'ok'" class="text-muted-foreground text-sm">{{ k[startState] }}</span>
      </div>
      <section v-if="history.some(a => a.submittedAt)" class="flex flex-col gap-2">
        <h2 class="text-sm font-medium">{{ k.history }}</h2>
        <ul class="flex flex-col divide-y rounded-md border text-sm">
          <li v-for="a in history.filter(x => x.submittedAt)" :key="a.id" class="flex items-center justify-between gap-2 p-2">
            <span>{{ a.submittedAt!.toDate().toLocaleString('ko-KR') }}<template v-if="a.isPractice"> · {{ k.practice }}</template></span>
            <NuxtLink v-if="results[a.id]" :to="`/s/${sid}/tests/${tid}/attempts/${a.id}`" class="font-medium hover:underline">
              {{ k.graded(results[a.id]!.score, results[a.id]!.maxScore) }}<template v-if="results[a.id]!.gradingStatus === 'pending'"> · {{ k.pending }}</template>
            </NuxtLink>
            <span v-else class="text-muted-foreground">{{ k.hidden }}</span>
          </li>
        </ul>
      </section>
    </template>

    <template v-else-if="phase === 'taking'">
      <ol class="flex flex-col gap-4">
        <li v-for="(it, n) in items" :key="it.questionId" class="flex flex-col gap-2 rounded-md border p-3">
          <div class="flex items-start gap-2">
            <span class="text-muted-foreground shrink-0 text-sm font-medium">{{ n + 1 }}.</span>
            <p class="flex-1 text-sm whitespace-pre-line"><MathText :text="it.prompt" /></p>
            <span class="text-muted-foreground shrink-0 text-xs">{{ k.pointsOf(it.points) }}</span>
          </div>
          <AttachmentList v-if="it.media?.length" :files="it.media" />
          <div v-if="it.type === 'single' || it.type === 'multi'" class="flex flex-col gap-1" role="group" :aria-label="it.prompt">
            <label v-for="i in choiceIdx(it)" :key="i" class="hover:bg-muted/50 flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm" :class="isPicked(it, i) ? 'border-primary bg-primary/5' : ''">
              <input :type="it.type === 'single' ? 'radio' : 'checkbox'" class="size-4" :name="it.questionId" :checked="isPicked(it, i)" @change="it.type === 'single' ? setSingle(it, i) : toggleMulti(it, i)">
              <MathText :text="it.choices[i]" />
            </label>
          </div>
          <div v-else-if="it.type === 'ox'" class="flex gap-2">
            <Button v-for="v in [true, false]" :key="String(v)" type="button" class="w-16 text-lg" :variant="answers[it.questionId] === v ? 'default' : 'outline'" @click="answers[it.questionId] = v">{{ k.ox[String(v)] }}</Button>
          </div>
          <Input v-else-if="it.type === 'short'" :model-value="(answers[it.questionId] as string) ?? ''" :placeholder="k.shortPlaceholder" :aria-label="it.prompt" @update:model-value="v => answers[it.questionId] = String(v)" />
          <Textarea v-else :model-value="(answers[it.questionId] as string) ?? ''" rows="4" :placeholder="k.essayPlaceholder" :aria-label="it.prompt" @update:model-value="v => answers[it.questionId] = String(v)" />
          <div v-if="attempt?.isPractice" class="flex flex-col gap-1">
            <Button v-if="!checked[it.questionId]" type="button" size="sm" variant="outline" class="self-start" :disabled="!answered(answers[it.questionId])" @click="check(it)">{{ k.check }}</Button>
            <div v-else class="bg-muted/50 flex flex-col gap-1 rounded-md p-2 text-sm">
              <p v-if="checked[it.questionId]!.score == null" class="text-muted-foreground">{{ k.essayNote }}</p>
              <p v-else-if="checked[it.questionId]!.score! > 0" class="flex items-center gap-1 text-green-700"><CheckIcon class="size-4" /> {{ k.correct }}</p>
              <p v-else class="text-destructive flex items-center gap-1"><XIcon class="size-4" /> {{ k.wrong }}</p>
              <p v-if="it.type !== 'essay'"><MathText :text="k.answerIs(answerText(it, checked[it.questionId]!.answer))" /></p>
              <p v-if="checked[it.questionId]!.explanation" class="text-muted-foreground whitespace-pre-line"><MathText :text="checked[it.questionId]!.explanation" /></p>
            </div>
          </div>
        </li>
      </ol>
      <div class="bg-background sticky bottom-0 flex items-center justify-between gap-2 border-t py-3">
        <span class="text-muted-foreground text-xs" :class="saveState === 'error' ? 'text-destructive' : ''">
          {{ saveState === 'saving' ? k.saving : saveState === 'saved' ? k.saved : saveState === 'error' ? k.saveFailed : '' }}
        </span>
        <Button :disabled="busy" @click="submit()">{{ k.submit }}</Button>
      </div>
    </template>

    <template v-else-if="phase === 'done' && outcome">
      <div class="flex flex-col items-center gap-2 rounded-md border p-6 text-center">
        <p v-if="outcome.score != null" class="text-3xl font-semibold">{{ k.score(outcome.score, outcome.maxScore) }}</p>
        <p v-else class="text-muted-foreground text-sm">{{ k.hiddenResult }}</p>
        <p v-if="outcome.gradingStatus === 'pending' && outcome.score != null" class="text-muted-foreground text-sm">{{ k.pendingEssay }}</p>
      </div>
      <ol v-if="doneResult && test?.settings.resultRelease !== 'scoreOnly'" class="flex flex-col divide-y rounded-md border text-sm">
        <li v-for="(it, n) in items" :key="it.questionId" class="flex items-center gap-2 p-2">
          <span class="text-muted-foreground w-6 text-right">{{ n + 1 }}</span>
          <span class="line-clamp-1 flex-1"><MathText :text="it.prompt" /></span>
          <span v-if="doneResult.items[it.questionId]?.score == null" class="text-muted-foreground">{{ k.pending }}</span>
          <span v-else :class="doneResult.items[it.questionId]!.score! > 0 ? 'text-green-700' : 'text-destructive'">{{ k.graded(doneResult.items[it.questionId]!.score!, it.points) }}</span>
        </li>
      </ol>
      <Button variant="outline" class="self-start" @click="phase = 'intro'">{{ k.back }}</Button>
    </template>
  </div>
</template>
