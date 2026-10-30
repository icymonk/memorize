<script setup lang="ts">
import type { MatchEntry, StudyMode } from '#shared/study'
import type { Member } from '~/features/space/services/invites'
import type { ModeResult, ReviewItem } from '~/features/vocab/components/study/types'
import type { Card } from '~/features/vocab/services/cards'
import type { Deck } from '~/features/vocab/services/decks'
import type { CardState } from '~/features/vocab/services/srs'
import { DAILY_LIMITS, DAY_MS, endOfToday, fixWrong, newState, practice } from '#shared/srs'
import { MATCH_PAIRS, STUDY_MODES } from '#shared/study'
import { RefreshCwIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { listMembers } from '~/features/space/services/invites'
import FlashcardsMode from '~/features/vocab/components/study/FlashcardsMode.vue'
import LearnMode from '~/features/vocab/components/study/LearnMode.vue'
import MatchMode from '~/features/vocab/components/study/MatchMode.vue'
import ReviewSession from '~/features/vocab/components/study/ReviewSession.vue'
import WriteMode from '~/features/vocab/components/study/WriteMode.vue'
import DictationMode from '~/features/vocab/components/study/DictationMode.vue'
import { listCards } from '~/features/vocab/services/cards'
import { getDeck } from '~/features/vocab/services/decks'
import { listDeckStates, saveState } from '~/features/vocab/services/srs'
import { getBestMatchMs, getMatchTop, recordSession } from '~/features/vocab/services/study'
import { ko } from '~/locales/ko'

definePageMeta({ layout: 'focus' })

const t = ko.vocab.study
const space = useSpaceStore()
const auth = useAuthStore()
const route = useRoute()
const { $firestore } = useNuxtApp()

const sid = computed(() => space.current!.id)
const uid = computed(() => auth.user!.uid)
const deckId = computed(() => route.params.deckId as string)
const mode = computed<StudyMode>(() => (STUDY_MODES as readonly string[]).includes(route.query.mode as string) ? route.query.mode as StudyMode : 'flashcards')
const minCards = computed(() => ({ flashcards: 1, learn: 4, write: 1, dictation: 1, match: MATCH_PAIRS.min, review: 1 })[mode.value])

const deck = ref<Deck | null>(null)
const cards = ref<Card[]>([])
const loading = ref(true)
const result = ref<ModeResult & { durationSec: number } | null>(null)
const run = ref(0)
const startedAt = ref(new Date())
const ranking = ref<MatchEntry[]>([])
const previousBest = ref<number | null>(null)
const members = ref<Member[]>([])
const reviewItems = ref<ReviewItem[]>([])
/** VOC-23 쌍 수 */
const pairs = ref<number>(MATCH_PAIRS.default)
const pairOptions = computed(() => [6, 8, 10, 12].filter(n => n <= cards.value.length))
/** VOC-40 학습하기·쓰기 답도 카드 상태에 */
const practiceStates = new Map<string, CardState>()
function onAnswer(cardId: string, correct: boolean, fix = false) {
  const card = cards.value.find(c => c.id === cardId)
  if (!card) return
  const now = Date.now()
  const cur = practiceStates.get(cardId) ?? { ...newState(now), sid: sid.value, uid: uid.value, deckId: deckId.value, cardId, contentRev: card.contentRev }
  const next: CardState = { ...cur, ...(fix ? fixWrong(cur) : practice(cur, correct, now)), contentRev: card.contentRev }
  practiceStates.set(cardId, next)
  saveState($firestore, next).catch(() => toast.error(t.saveFailed))
}

const resumeKey = computed(() => `${sid.value}.${deckId.value}.${mode.value}${route.query.starred === '1' ? '.starred' : ''}.${uid.value}`)
const accuracy = computed(() => result.value && result.value.cards ? Math.round(result.value.correct / result.value.cards * 100) : 0)
const name = (u: string) => members.value.find(m => m.uid === u)?.displayName ?? '—'

onMounted(async () => {
  try {
    const [d, all] = await Promise.all([getDeck($firestore, sid.value, deckId.value), listCards($firestore, sid.value, deckId.value)])
    let c = all
    deck.value = d
    // VOC-20 별표 카드만
    if (route.query.starred === '1' && mode.value !== 'review') {
      const starred = new Set((await listDeckStates($firestore, sid.value, uid.value, deckId.value)).filter(s => s.starred).map(s => s.cardId))
      c = c.filter(card => starred.has(card.id))
    }
    cards.value = c
    if (mode.value === 'learn' || mode.value === 'write' || mode.value === 'dictation') {
      for (const s of await listDeckStates($firestore, sid.value, uid.value, deckId.value)) practiceStates.set(s.cardId, s)
    }
    if (mode.value === 'review') {
      // VOC-26: 이 단어장에서 오늘 복습할 카드 + 아직 안 본 새 카드(하루 상한까지)
      const states = new Map((await listDeckStates($firestore, sid.value, uid.value, deckId.value)).map(s => [s.cardId, s]))
      const until = endOfToday(Date.now())
      const due = c.filter(card => states.get(card.id) && states.get(card.id)!.status !== 'new' && states.get(card.id)!.due <= until).map(card => ({ sid: sid.value, deckId: deckId.value, card, state: states.get(card.id)! }))
      const fresh = c.filter(card => (states.get(card.id)?.status ?? 'new') === 'new').slice(0, Math.max(0, DAILY_LIMITS.newCards - seenToday(states))).map(card => ({ sid: sid.value, deckId: deckId.value, card, state: states.get(card.id) ?? null }))
      reviewItems.value = [...due.sort((a, b) => a.state.due - b.state.due), ...fresh]
    }
    if (mode.value === 'match') {
      const [best, m] = await Promise.all([getBestMatchMs($firestore, sid.value, uid.value, deckId.value), listMembers($firestore, sid.value)])
      previousBest.value = best
      members.value = m
    }
  }
  finally {
    loading.value = false
  }
})

/** VOC-44 오늘 이미 처음 본 카드 수 */
function seenToday(states: Map<string, CardState>) {
  const start = endOfToday(Date.now()) - DAY_MS
  return [...states.values()].filter(s => (s.firstSeenAt ?? 0) > start).length
}

async function loadRanking() {
  ranking.value = await getMatchTop($firestore, sid.value, deckId.value)
}

async function onDone(r: ModeResult) {
  const durationSec = r.ms ? r.ms / 1000 : (Date.now() - startedAt.value.getTime()) / 1000
  result.value = { ...r, durationSec }
  try {
    await recordSession($firestore, sid.value, uid.value, { deckId: deckId.value, mode: mode.value, pairs: mode.value === 'match' ? pairs.value : undefined, cards: r.cards, correct: r.correct, durationSec, startedAt: startedAt.value })
  }
  catch {
    toast.error(t.saveFailed)
  }
  if (mode.value === 'match') setTimeout(loadRanking, 1500)
}

function again() {
  if (result.value?.ms && (!previousBest.value || result.value.ms < previousBest.value)) previousBest.value = result.value.ms
  result.value = null
  startedAt.value = new Date()
  run.value++
}
</script>

<template>
  <div v-if="loading" class="text-muted-foreground p-10 text-center text-sm">
    …
  </div>
  <div v-else-if="!deck" class="text-muted-foreground p-10 text-center text-sm">
    {{ ko.errors.notFound }}
  </div>
  <div v-else-if="cards.length < minCards" class="flex flex-col items-center gap-4 p-10 text-center">
    <p class="text-muted-foreground text-sm">
      {{ t.needCards(minCards) }}
    </p>
    <Button variant="outline" as-child>
      <NuxtLink :to="`/s/${sid}/decks/${deckId}`">
        {{ t.result.back }}
      </NuxtLink>
    </Button>
  </div>

  <div v-else-if="mode === 'review' && !reviewItems.length && !result" class="flex flex-col items-center gap-4 p-10 text-center">
    <p class="text-muted-foreground text-sm">
      {{ ko.vocab.review.empty }}
    </p>
    <Button variant="outline" as-child>
      <NuxtLink :to="`/s/${sid}/decks/${deckId}`">
        {{ t.result.back }}
      </NuxtLink>
    </Button>
  </div>

  <div v-else-if="result" class="mx-auto flex w-full max-w-md flex-col gap-6 p-6">
    <Teleport to="#focus-header">
      <span class="text-sm font-medium">{{ t.modes[mode] }}</span>
    </Teleport>
    <h1 class="text-center text-2xl font-semibold">
      {{ t.result.title }}
    </h1>
    <dl class="grid grid-cols-3 gap-2 text-center">
      <div class="rounded-xl border p-3">
        <dt class="text-muted-foreground text-xs">
          {{ t.result.cards }}
        </dt>
        <dd class="text-xl font-semibold tabular-nums">
          {{ result.cards }}
        </dd>
      </div>
      <div class="rounded-xl border p-3">
        <dt class="text-muted-foreground text-xs">
          {{ t.result.accuracy }}
        </dt>
        <dd class="text-xl font-semibold tabular-nums">
          {{ accuracy }}%
        </dd>
      </div>
      <div class="rounded-xl border p-3">
        <dt class="text-muted-foreground text-xs">
          {{ t.result.time }}
        </dt>
        <dd class="text-xl font-semibold tabular-nums">
          {{ t.duration(result.durationSec) }}
        </dd>
      </div>
    </dl>

    <section v-if="mode === 'match'" class="flex flex-col gap-2">
      <p v-if="pairs !== MATCH_PAIRS.default" class="text-muted-foreground text-center text-xs">
        {{ t.match.rankedOnly(MATCH_PAIRS.default) }}
      </p>
      <p v-if="result.ms && (!previousBest || result.ms < previousBest)" class="text-center font-medium text-emerald-600">
        {{ t.match.newBest }}
      </p>
      <p v-else-if="previousBest" class="text-muted-foreground text-center text-sm">
        {{ t.match.myBest }}: {{ t.duration(previousBest / 1000) }}
      </p>
      <div v-if="space.current?.kind !== 'personal'" class="flex flex-col gap-1">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold">
            {{ t.match.ranking }}
          </h2>
          <Button variant="ghost" size="icon" class="size-8" :aria-label="t.match.refresh" @click="loadRanking">
            <RefreshCwIcon />
          </Button>
        </div>
        <p v-if="!ranking.length" class="text-muted-foreground text-sm">
          {{ t.match.noRanking }}
        </p>
        <ol v-else class="divide-y rounded-xl border text-sm">
          <li v-for="(e, i) in ranking" :key="e.uid" class="flex justify-between px-3 py-2" :class="e.uid === uid && 'font-semibold'">
            <span>{{ i + 1 }}. {{ name(e.uid) }}</span>
            <span class="tabular-nums">{{ t.duration(e.ms / 1000) }}</span>
          </li>
        </ol>
      </div>
    </section>

    <div class="grid grid-cols-2 gap-2">
      <Button variant="outline" as-child>
        <NuxtLink :to="`/s/${sid}/decks/${deckId}`">
          {{ t.result.back }}
        </NuxtLink>
      </Button>
      <Button v-if="mode !== 'review'" @click="again">
        {{ t.result.again }}
      </Button>
    </div>
  </div>

  <template v-else>
    <FlashcardsMode v-if="mode === 'flashcards'" :key="run" :cards="cards" :lang="deck.langFrom" :resume-key="resumeKey" @done="onDone" />
    <LearnMode v-else-if="mode === 'learn'" :key="run" :cards="cards" :resume-key="resumeKey" @done="onDone" @answer="onAnswer" />
    <WriteMode v-else-if="mode === 'write'" :key="run" :cards="cards" :resume-key="resumeKey" @done="onDone" @answer="onAnswer" />
    <DictationMode v-else-if="mode === 'dictation'" :key="run" :cards="cards" :lang="deck.langFrom" :resume-key="resumeKey" @done="onDone" @answer="onAnswer" />
    <ReviewSession v-else-if="mode === 'review'" :items="reviewItems" :uid="uid" @done="onDone" />
    <div v-else class="flex flex-col">
      <div v-if="pairOptions.length > 1" class="flex items-center justify-center gap-1 pt-3 text-sm" role="radiogroup" :aria-label="t.match.pairs">
        <span class="text-muted-foreground mr-1">{{ t.match.pairs }}</span>
        <Button v-for="n in pairOptions" :key="n" size="sm" role="radio" :aria-checked="pairs === n" :variant="pairs === n ? 'default' : 'outline'" @click="pairs = n">
          {{ n }}
        </Button>
      </div>
      <MatchMode :key="`${run}-${pairs}`" :cards="cards" :pairs="pairs" @done="onDone" />
    </div>
  </template>
</template>
