<script setup lang="ts">
import type { ModeResult } from './types'
import type { Card } from '~/features/vocab/services/cards'
import { MATCH_PAIRS, shuffle } from '#shared/study'
import { ko } from '~/locales/ko'

const props = defineProps<{ cards: Card[] }>()
const emit = defineEmits<{ done: [ModeResult] }>()
const t = ko.vocab.study

interface Tile { key: string, cardId: string, text: string }
const picked = shuffle(props.cards).slice(0, MATCH_PAIRS.default)
const tiles = shuffle(picked.flatMap<Tile>(c => [
  { key: `${c.id}:f`, cardId: c.id, text: c.front },
  { key: `${c.id}:b`, cardId: c.id, text: c.back[0]! },
]))
const matched = ref(new Set<string>())
const selected = ref<Tile | null>(null)
const wrong = ref<string[]>([])
const startedAt = performance.now()
const elapsed = ref(0)
const timer = setInterval(() => { elapsed.value = (performance.now() - startedAt) / 1000 }, 100)
onBeforeUnmount(() => clearInterval(timer))

function pick(tile: Tile) {
  if (matched.value.has(tile.cardId) || wrong.value.length) return
  const first = selected.value
  if (!first || first.key === tile.key) {
    selected.value = first?.key === tile.key ? null : tile
    return
  }
  selected.value = null
  if (first.cardId === tile.cardId) {
    matched.value = new Set([...matched.value, tile.cardId])
    if (matched.value.size === picked.length) {
      clearInterval(timer)
      emit('done', { cards: picked.length, correct: picked.length, ms: Math.round(performance.now() - startedAt) })
    }
    return
  }
  wrong.value = [first.key, tile.key]
  setTimeout(() => { wrong.value = [] }, 500)
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
    <Teleport to="#focus-header">
      <span class="text-sm tabular-nums">{{ t.duration(elapsed) }}</span>
    </Teleport>
    <div class="grid grid-cols-3 gap-2 sm:grid-cols-4">
      <button
        v-for="tile in tiles"
        :key="tile.key"
        class="bg-card flex min-h-20 items-center justify-center rounded-xl border p-2 text-center text-sm transition"
        :class="[
          matched.has(tile.cardId) && 'invisible',
          selected?.key === tile.key && 'border-primary ring-primary/30 ring-2',
          wrong.includes(tile.key) && 'border-destructive bg-destructive/10',
        ]"
        @click="pick(tile)"
      >
        {{ tile.text }}
      </button>
    </div>
  </div>
</template>
