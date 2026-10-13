<script setup lang="ts">
import type { DaySummary } from '#shared/journal'
import { summarizeSessions } from '#shared/journal'
import { ko } from '~/locales/ko'
import { listDecks } from '~/features/vocab/services/decks'
import { listDaySessions } from '../services/journal'

/** NOTE-32·34: 일지 날짜의 학습 요약과 학습 시간 제안 */
const props = defineProps<{ sid: string, ownerId: string, date: string, minutes?: unknown, editable: boolean }>()
const emit = defineEmits<{ fillMinutes: [minutes: number] }>()
const t = ko.notes.journal
const modes = ko.vocab.study.modes
const auth = useAuthStore()
const { $firestore } = useNuxtApp()
const summary = ref<DaySummary | null>(null)
const deckNames = ref<string[]>([])
const hidden = ref(false)

async function load() {
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
watch(() => [props.sid, props.ownerId, props.date], load, { immediate: true })
const canFill = computed(() => props.editable && typeof props.minutes !== 'number' && (summary.value?.minutes ?? 0) > 0)
</script>

<template>
  <section v-if="summary && !hidden" class="bg-muted/40 flex flex-col gap-1.5 rounded-lg border px-4 py-3 text-sm" :aria-label="t.summary">
    <span class="font-medium">{{ t.summary }}</span>
    <p v-if="!summary.sessions" class="text-muted-foreground">
      {{ t.noActivity }}
    </p>
    <template v-else>
      <p>{{ t.totals(summary.minutes, summary.cards, summary.accuracy) }}</p>
      <p class="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
        <span v-for="(n, m) in summary.byMode" :key="m">{{ modes[m] ?? m }} {{ n }}</span>
        <span v-if="deckNames.length">· {{ deckNames.join(', ') }}</span>
      </p>
      <Button v-if="canFill" size="sm" variant="outline" class="self-start" @click="emit('fillMinutes', summary.minutes)">
        {{ t.fillMinutes(summary.minutes) }}
      </Button>
    </template>
  </section>
</template>
