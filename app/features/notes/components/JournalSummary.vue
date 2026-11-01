<script setup lang="ts">
import type { DaySummary } from '#shared/journal'
import type { BookDay, ReadingDay } from '#shared/reading'
import { summarizeSessions } from '#shared/journal'
import { summarizeReading } from '#shared/reading'
import { ko } from '~/locales/ko'
import { listDayFinished, listDayLogs } from '~/features/reading/services/logs'
import { countDayQuotes } from '~/features/reading/services/quotes'
import { listDecks } from '~/features/vocab/services/decks'
import { listDaySessions } from '../services/journal'

/** NOTE-32·34: 일지 날짜의 학습 요약(단어·독서)과 학습 시간 제안 */
const props = defineProps<{ sid: string, ownerId: string, date: string, minutes?: unknown, editable: boolean }>()
const emit = defineEmits<{ fillMinutes: [minutes: number] }>()
const t = ko.notes.journal
const modes = ko.vocab.study.modes
const units = ko.reading.log.units
const auth = useAuthStore()
const { $firestore } = useNuxtApp()
const summary = ref<DaySummary | null>(null)
const deckNames = ref<string[]>([])
const hidden = ref(false)
const reading = ref<ReadingDay | null>(null)
const quotes = ref(0)
const finished = ref<string[]>([])

async function loadVocab() {
  hidden.value = false
  try {
    summary.value = summarizeSessions(await listDaySessions($firestore, props.sid, props.ownerId, props.date))
    if (summary.value.deckIds.length) {
      const decks = await listDecks($firestore, props.sid, auth.user!.uid)
      deckNames.value = summary.value.deckIds.map(id => decks.find(d => d.id === id)?.title).filter((x): x is string => !!x)
    }
    else { deckNames.value = [] }
  }
  catch { hidden.value = true }
}

/** 독서는 따로 읽어서, 막혀도(진도 숨김 등) 단어 요약은 그대로 둔다 */
async function loadReading() {
  const [logs, q, f] = await Promise.allSettled([
    listDayLogs($firestore, props.sid, props.ownerId, props.date),
    countDayQuotes($firestore, props.sid, props.ownerId, auth.user!.uid, props.date),
    listDayFinished($firestore, props.sid, props.ownerId, props.date),
  ])
  reading.value = logs.status === 'fulfilled' ? summarizeReading(logs.value) : null
  quotes.value = q.status === 'fulfilled' ? q.value : 0
  finished.value = f.status === 'fulfilled' ? f.value : []
}

watch(() => [props.sid, props.ownerId, props.date], () => Promise.all([loadVocab(), loadReading()]), { immediate: true })

const hasVocab = computed(() => !hidden.value && !!summary.value?.sessions)
const hasReading = computed(() => !!reading.value?.books.length || quotes.value > 0 || finished.value.length > 0)
const totalMinutes = computed(() => (hasVocab.value ? summary.value!.minutes : 0) + (reading.value?.minutes ?? 0))
const canFill = computed(() => props.editable && typeof props.minutes !== 'number' && totalMinutes.value > 0)
const range = (b: BookDay) => b.to == null ? '' : `${b.from != null && b.from < b.to ? `${b.from}~` : ''}${b.to}${units[b.unit] ?? ''}`
</script>

<template>
  <section v-if="(summary && !hidden) || hasReading" class="bg-muted/40 flex flex-col gap-1.5 rounded-lg border px-4 py-3 text-sm" :aria-label="t.summary">
    <span class="font-medium">{{ t.summary }}</span>
    <p v-if="!hasVocab && !hasReading" class="text-muted-foreground">
      {{ t.noActivity }}
    </p>
    <template v-if="hasVocab && summary">
      <p>{{ t.totals(summary.minutes, summary.cards, summary.accuracy) }}</p>
      <p class="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
        <span v-for="(n, m) in summary.byMode" :key="m">{{ modes[m] ?? m }} {{ n }}</span>
        <span v-if="deckNames.length">· {{ deckNames.join(', ') }}</span>
      </p>
    </template>
    <template v-if="hasReading">
      <p v-for="b in reading?.books ?? []" :key="b.bookKey">
        {{ t.readingBook(b.title, range(b), b.minutes) }}
      </p>
      <p v-if="quotes || finished.length" class="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
        <span v-if="quotes">{{ t.quotesSaved(quotes) }}</span>
        <span v-if="finished.length">{{ t.finishedBooks(finished) }}</span>
      </p>
    </template>
    <Button v-if="canFill" size="sm" variant="outline" class="self-start" @click="emit('fillMinutes', totalMinutes)">
      {{ t.fillMinutes(totalMinutes) }}
    </Button>
  </section>
</template>
