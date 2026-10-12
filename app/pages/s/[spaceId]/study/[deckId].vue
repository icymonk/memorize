<script setup lang="ts">
import type { MatchEntry, StudyMode } from '#shared/study'
import type { Member } from '~/features/space/services/invites'
import type { ModeResult } from '~/features/vocab/components/study/types'
import type { Card } from '~/features/vocab/services/cards'
import type { Deck } from '~/features/vocab/services/decks'
import { MATCH_PAIRS, STUDY_MODES } from '#shared/study'
import { RefreshCwIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { listMembers } from '~/features/space/services/invites'
import FlashcardsMode from '~/features/vocab/components/study/FlashcardsMode.vue'
import LearnMode from '~/features/vocab/components/study/LearnMode.vue'
import MatchMode from '~/features/vocab/components/study/MatchMode.vue'
import WriteMode from '~/features/vocab/components/study/WriteMode.vue'
import { listCards } from '~/features/vocab/services/cards'
import { getDeck } from '~/features/vocab/services/decks'
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
const minCards = computed(() => ({ flashcards: 1, learn: 2, write: 1, match: MATCH_PAIRS.min })[mode.value])

const deck = ref<Deck | null>(null)
const cards = ref<Card[]>([])
const loading = ref(true)
const result = ref<ModeResult & { durationSec: number } | null>(null)
const run = ref(0)
const startedAt = ref(new Date())
const ranking = ref<MatchEntry[]>([])
const previousBest = ref<number | null>(null)
const members = ref<Member[]>([])

const resumeKey = computed(() => `${sid.value}.${deckId.value}.${mode.value}.${uid.value}`)
const accuracy = computed(() => result.value && result.value.cards ? Math.round(result.value.correct / result.value.cards * 100) : 0)
const name = (u: string) => members.value.find(m => m.uid === u)?.displayName ?? '—'

onMounted(async () => {
  try {
    const [d, c] = await Promise.all([getDeck($firestore, sid.value, deckId.value), listCards($firestore, sid.value, deckId.value)])
    deck.value = d
    cards.value = c
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

async function loadRanking() {
  ranking.value = await getMatchTop($firestore, sid.value, deckId.value)
}

async function onDone(r: ModeResult) {
  const durationSec = r.ms ? r.ms / 1000 : (Date.now() - startedAt.value.getTime()) / 1000
  result.value = { ...r, durationSec }
  try {
    await recordSession($firestore, sid.value, uid.value, { deckId: deckId.value, mode: mode.value, cards: r.cards, correct: r.correct, durationSec, startedAt: startedAt.value })
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
      <Button @click="again">
        {{ t.result.again }}
      </Button>
    </div>
  </div>

  <template v-else>
    <FlashcardsMode v-if="mode === 'flashcards'" :key="run" :cards="cards" :lang="deck.langFrom" :resume-key="resumeKey" @done="onDone" />
    <LearnMode v-else-if="mode === 'learn'" :key="run" :cards="cards" :resume-key="resumeKey" @done="onDone" />
    <WriteMode v-else-if="mode === 'write'" :key="run" :cards="cards" :resume-key="resumeKey" @done="onDone" />
    <MatchMode v-else :key="run" :cards="cards" @done="onDone" />
  </template>
</template>
