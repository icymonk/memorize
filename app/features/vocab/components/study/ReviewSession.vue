<script setup lang="ts">
import CardWord from '../CardWord.vue'
import type { ModeResult, ReviewItem } from './types'
import type { Rating } from '#shared/srs'
import type { CardState } from '~/features/vocab/services/srs'
import { newState, preview, RATINGS, review } from '#shared/srs'
import { toast } from 'vue-sonner'
import { saveState } from '~/features/vocab/services/srs'
import { ko } from '~/locales/ko'

const props = defineProps<{ items: ReviewItem[], uid: string }>()
const emit = defineEmits<{ done: [ModeResult] }>()
const t = ko.vocab.review
const { $firestore } = useNuxtApp()

const queue = ref<ReviewItem[]>([...props.items])
const revealed = ref(false)
const missed = new Set<string>()
const item = computed(() => queue.value[0])
const current = computed(() => {
  const i = item.value
  return i?.state ?? (i ? { ...newState(Date.now()), sid: i.sid, uid: props.uid, deckId: i.deckId, cardId: i.card.id, contentRev: i.card.contentRev } : null)
})
const intervals = computed(() => current.value ? preview(current.value, Date.now()) : null)

function rate(rating: Rating) {
  const i = item.value
  const s = current.value
  if (!i || !s || !revealed.value) return
  const next: CardState = { ...s, ...review(s, rating, Date.now()), contentRev: i.card.contentRev }
  saveState($firestore, next).catch(() => toast.error(t.saveFailed))
  const rest = queue.value.slice(1)
  if (rating === 'again') {
    missed.add(i.card.id)
    rest.push({ ...i, state: next })
  }
  queue.value = rest
  revealed.value = false
  if (!rest.length) emit('done', { cards: props.items.length, correct: props.items.length - missed.size })
}

function onKey(e: KeyboardEvent) {
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault()
    revealed.value = true
    return
  }
  const n = Number(e.key)
  if (n >= 1 && n <= 4) rate(RATINGS[n - 1]!)
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div v-if="item" class="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 p-4">
    <Teleport to="#focus-header">
      <span class="text-sm tabular-nums">{{ t.remaining(queue.length) }}</span>
    </Teleport>
    <div class="bg-card flex min-h-64 flex-1 flex-col items-center justify-center gap-3 rounded-2xl border p-6 text-center shadow-sm">
      <span class="text-3xl font-semibold"><CardWord :front="item.card.front" :reading="item.card.reading" /></span>
      <span v-if="item.card.phonetic" class="text-muted-foreground">{{ item.card.phonetic }}</span>
      <template v-if="revealed">
        <hr class="w-24">
        <span class="text-2xl">{{ item.card.back.join(', ') }}</span>
        <span v-if="item.card.examples[0]" class="text-muted-foreground text-sm">{{ item.card.examples[0].text }}</span>
      </template>
    </div>
    <Button v-if="!revealed" size="lg" @click="revealed = true">
      {{ t.show }}
    </Button>
    <div v-else class="grid grid-cols-4 gap-2">
      <Button
        v-for="r in RATINGS"
        :key="r"
        :variant="r === 'again' ? 'destructive' : r === 'good' ? 'default' : 'outline'"
        class="h-auto flex-col gap-0.5 py-2"
        @click="rate(r)"
      >
        <span>{{ t.ratings[r] }}</span>
        <span class="text-xs opacity-70">{{ t.interval(intervals![r]) }}</span>
      </Button>
    </div>
    <p class="text-muted-foreground hidden text-center text-xs md:block">
      {{ t.keys }}
    </p>
  </div>
</template>
