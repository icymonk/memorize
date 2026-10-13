<script setup lang="ts">
import type { PaperItem } from '#shared/schemas/test'
import type { Attempt, AttemptResult, KeyItem } from '~/features/tests/services/attempts'
import type { Test } from '~/features/tests/services/tests'
import { ArrowLeftIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { getAnswerKey, getAttempt, getPaper, getResult } from '~/features/tests/services/attempts'
import { listMembers } from '~/features/space/services/invites'
import { getTest } from '~/features/tests/services/tests'
import { errorMessage } from '~/lib/errors'
import { callFn } from '~/lib/functions'
import { ko } from '~/locales/ko'

/** TST-31·32 응시 결과: 진행자는 문제별 점수(부분 점수)와 코멘트로 채점, 응시자는 공개된 결과를 본다 */
definePageMeta({ key: r => r.fullPath })
const t = ko.exams
const g = t.grade
const route = useRoute()
const space = useSpaceStore()
const auth = useAuthStore()
const { $firestore, $functions } = useNuxtApp()
const sid = space.current!.id
const tid = String(route.params.testId)
const aid = String(route.params.attemptId)
const uid = auth.user!.uid

const test = ref<Test | null>(null)
const paper = ref<PaperItem[]>([])
const attempt = ref<Attempt | null>(null)
const result = ref<AttemptResult | null>(null)
const key = ref<Record<string, KeyItem> | null>(null)
const takerName = ref('')
const scores = ref<Record<string, number | ''>>({})
const comments = ref<Record<string, string>>({})
const loading = ref(true)
const busy = ref(false)

const isHost = computed(() => !!test.value?.hostIds.includes(uid))
const byId = computed(() => new Map(paper.value.map(p => [p.questionId, p])))
const items = computed(() => (attempt.value?.order ?? paper.value.map(p => p.questionId)).map(id => byId.value.get(id)).filter((x): x is PaperItem => !!x))
const showItems = computed(() => isHost.value || test.value?.settings.resultRelease !== 'scoreOnly' || !!result.value?.isPractice)

function fmtAnswer(it: PaperItem, a: unknown): string {
  if (a == null || (Array.isArray(a) && !a.length) || a === '') return g.noAnswer
  if (it.type === 'single' || it.type === 'multi') return (a as number[]).map(i => it.choices[Number(i)] ?? '').join(', ')
  if (it.type === 'ox') return t.take.ox[String(Array.isArray(a) ? a[0] : a)] ?? ''
  return Array.isArray(a) ? a.join(', ') : String(a)
}

onMounted(async () => {
  try {
    test.value = await getTest($firestore, sid, tid)
    const [p, a, r] = await Promise.all([getPaper($firestore, sid, tid).catch(() => null), getAttempt($firestore, sid, tid, aid).catch(() => null), getResult($firestore, sid, tid, aid)])
    paper.value = p ?? []
    attempt.value = a
    result.value = r
    if (isHost.value) {
      key.value = await getAnswerKey($firestore, sid, tid)
      const ms = await listMembers($firestore, sid).catch(() => [])
      takerName.value = ms.find(m => m.uid === a?.uid)?.displayName ?? ''
    }
    for (const [qid, it] of Object.entries(r?.items ?? {})) scores.value[qid] = it.score ?? ''
    comments.value = { ...(r?.comments ?? {}) }
  }
  catch {
    toast.error(t.loadFailed)
  }
  finally {
    loading.value = false
  }
})

async function save() {
  busy.value = true
  try {
    const s = Object.fromEntries(Object.entries(scores.value).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)]))
    const c = Object.fromEntries(Object.entries(comments.value).map(([k, v]) => [k, v.trim()]))
    await callFn($functions, 'gradeAttempt', { spaceId: sid, testId: tid, attemptId: aid, scores: s, comments: c })
    result.value = await getResult($firestore, sid, tid, aid)
    toast.success(g.saved)
  }
  catch (e) {
    toast.error(errorMessage(e) ?? ko.errors.unknown)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 md:p-6">
    <div class="flex items-center gap-2">
      <Button variant="ghost" size="icon" class="size-8" as-child :aria-label="t.take.back">
        <NuxtLink :to="isHost ? `/s/${sid}/tests/${tid}` : `/s/${sid}/tests/${tid}/take`"><ArrowLeftIcon /></NuxtLink>
      </Button>
      <h1 class="flex-1 truncate text-xl font-semibold">{{ test?.title }} · {{ g.title }}</h1>
    </div>
    <p v-if="loading" class="text-muted-foreground text-sm">{{ t.loading }}</p>
    <p v-else-if="!result" class="text-muted-foreground rounded-md border p-4 text-sm">{{ g.hiddenNote }}</p>
    <template v-else>
      <div class="flex flex-wrap items-center gap-2 rounded-md border p-3">
        <span v-if="takerName" class="font-medium">{{ takerName }}</span>
        <span class="text-2xl font-semibold">{{ t.take.score(result.score, result.maxScore) }}</span>
        <Badge v-if="result.gradingStatus === 'pending'" variant="secondary">{{ t.take.pending }}</Badge>
        <Badge v-if="result.isPractice" variant="outline">{{ g.practice }}</Badge>
        <span v-if="attempt?.submittedAt" class="text-muted-foreground ml-auto text-xs">{{ g.submittedAt(attempt.submittedAt.toDate().toLocaleString('ko-KR')) }}</span>
      </div>
      <ol v-if="showItems" class="flex flex-col gap-3">
        <li v-for="(it, n) in items" :key="it.questionId" class="flex flex-col gap-2 rounded-md border p-3 text-sm">
          <div class="flex items-start gap-2">
            <span class="text-muted-foreground shrink-0 font-medium">{{ n + 1 }}.</span>
            <p class="flex-1 whitespace-pre-line">{{ it.prompt }}</p>
            <span v-if="result.items[it.questionId]?.score == null" class="text-muted-foreground shrink-0 text-xs">{{ t.take.pending }}</span>
            <span v-else class="shrink-0 text-xs font-medium" :class="result.items[it.questionId]!.score! >= it.points ? 'text-green-700' : result.items[it.questionId]!.score! > 0 ? 'text-amber-700' : 'text-destructive'">
              {{ t.take.graded(result.items[it.questionId]!.score!, it.points) }}
            </span>
          </div>
          <p v-if="attempt"><span class="text-muted-foreground">{{ g.myAnswer }}:</span> <span class="whitespace-pre-line">{{ fmtAnswer(it, attempt.answers[it.questionId]) }}</span></p>
          <template v-if="key?.[it.questionId]">
            <p v-if="it.type !== 'essay'"><span class="text-muted-foreground">{{ g.answer }}:</span> {{ fmtAnswer(it, key[it.questionId]!.answer) }}</p>
            <p v-if="key[it.questionId]!.rubric" class="whitespace-pre-line"><span class="text-muted-foreground">{{ g.rubric }}:</span> {{ key[it.questionId]!.rubric }}</p>
          </template>
          <div v-if="isHost" class="flex flex-wrap items-start gap-2">
            <Input v-model.number="scores[it.questionId]" type="number" min="0" :max="it.points" step="0.5" class="h-8 w-20" :aria-label="`${n + 1} ${g.score}`" />
            <span class="text-muted-foreground self-center text-xs">/ {{ it.points }}</span>
            <Textarea v-model="comments[it.questionId]" rows="1" class="min-h-8 flex-1" :placeholder="g.commentPlaceholder" :aria-label="`${n + 1} ${g.comment}`" />
          </div>
          <p v-else-if="result.comments?.[it.questionId]" class="bg-muted/50 rounded-md p-2 whitespace-pre-line"><span class="text-muted-foreground">{{ g.comment }}:</span> {{ result.comments[it.questionId] }}</p>
        </li>
      </ol>
      <div v-if="isHost" class="bg-background sticky bottom-0 flex justify-end border-t py-3">
        <Button :disabled="busy" @click="save">{{ g.save }}</Button>
      </div>
    </template>
  </div>
</template>
