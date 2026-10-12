<script setup lang="ts">
import type { ModeResult } from './types'
import type { Card } from '~/features/vocab/services/cards'
import type { Deck } from '~/features/vocab/services/decks'
import { shuffle } from '#shared/study'
import { ArrowLeftIcon, ArrowRightIcon, RepeatIcon, ShuffleIcon, Volume2Icon } from '@lucide/vue'
import { useSpeech } from '~/features/vocab/composables/useSpeech'
import { useStudyResume } from '~/features/vocab/composables/useStudyResume'
import { ko } from '~/locales/ko'

const props = defineProps<{ cards: Card[], lang: Deck['langFrom'], resumeKey: string }>()
const emit = defineEmits<{ done: [ModeResult] }>()
const t = ko.vocab.study

interface State { order: string[], index: number, known: string[], unknown: string[], swapped: boolean }
const resume = useStudyResume<State>(props.resumeKey)
const speech = useSpeech()
const byId = computed(() => new Map(props.cards.map(c => [c.id, c])))

function fresh(): State {
  return { order: props.cards.map(c => c.id), index: 0, known: [], unknown: [], swapped: false }
}
const saved = resume.load()
const valid = saved && saved.order.every(id => byId.value.has(id)) && saved.index < saved.order.length
const state = ref<State>(valid ? saved : fresh())
const resumed = ref(!!valid && saved!.index > 0)
const flipped = ref(false)

const card = computed(() => byId.value.get(state.value.order[state.value.index]!)!)
watch(state, v => resume.save(v), { deep: true })

function go(d: number) {
  const i = state.value.index + d
  if (i < 0 || i >= state.value.order.length) return
  state.value.index = i
  flipped.value = false
}

function mark(known: boolean) {
  const id = card.value.id
  const s = state.value
  s.known = s.known.filter(x => x !== id)
  s.unknown = s.unknown.filter(x => x !== id)
  ;(known ? s.known : s.unknown).push(id)
  if (s.index === s.order.length - 1) {
    resume.clear()
    emit('done', { cards: s.order.length, correct: s.known.length })
    return
  }
  go(1)
}

function reshuffle() {
  state.value = { ...fresh(), order: shuffle(props.cards.map(c => c.id)), swapped: state.value.swapped }
  flipped.value = false
  resumed.value = false
}

function restart() {
  state.value = { ...fresh(), swapped: state.value.swapped }
  flipped.value = false
  resumed.value = false
}

function onKey(e: KeyboardEvent) {
  if ((e.target as HTMLElement).closest('input, textarea, select')) return
  if (e.key === ' ') { e.preventDefault(); flipped.value = !flipped.value }
  else if (e.key === '1') mark(true)
  else if (e.key === '2') mark(false)
  else if (e.key === 'ArrowLeft') go(-1)
  else if (e.key === 'ArrowRight') go(1)
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

const showFront = computed(() => flipped.value === state.value.swapped)
</script>

<template>
  <div class="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 p-4">
    <Teleport to="#focus-header">
      <span class="text-sm tabular-nums">{{ state.index + 1 }} / {{ state.order.length }}</span>
    </Teleport>
    <p v-if="resumed" class="text-muted-foreground text-center text-xs">
      {{ t.resumed }}
      <button class="underline" @click="restart">
        {{ t.restart }}
      </button>
    </p>
    <button
      class="bg-card flex min-h-72 flex-1 flex-col items-center justify-center gap-3 rounded-2xl border p-6 text-center shadow-sm"
      @click="flipped = !flipped"
    >
      <template v-if="showFront">
        <span class="text-3xl font-semibold">{{ card.front }}</span>
        <span v-if="card.phonetic" class="text-muted-foreground">{{ card.phonetic }}</span>
      </template>
      <template v-else>
        <span class="text-2xl">{{ card.back.join(', ') }}</span>
        <span v-if="card.examples[0]" class="text-muted-foreground text-sm">{{ card.examples[0].text }}</span>
      </template>
      <span class="text-muted-foreground mt-2 text-xs">{{ t.flipHint }}</span>
    </button>
    <div class="grid grid-cols-2 gap-2">
      <Button variant="outline" size="lg" @click="mark(false)">
        {{ t.dontKnow }}
      </Button>
      <Button size="lg" @click="mark(true)">
        {{ t.know }}
      </Button>
    </div>
    <div class="flex items-center justify-between">
      <Button variant="ghost" size="icon" :aria-label="t.prev" :disabled="state.index === 0" @click="go(-1)">
        <ArrowLeftIcon />
      </Button>
      <div class="flex gap-1">
        <Button v-if="speech.supported" variant="ghost" size="icon" aria-label="발음" @click="speech.speak(card.front, lang)">
          <Volume2Icon />
        </Button>
        <Button variant="ghost" size="icon" :aria-label="t.shuffle" @click="reshuffle">
          <ShuffleIcon />
        </Button>
        <Button variant="ghost" size="icon" :aria-label="t.swap" :class="state.swapped && 'bg-accent'" @click="state.swapped = !state.swapped">
          <RepeatIcon />
        </Button>
      </div>
      <Button variant="ghost" size="icon" :aria-label="t.next" :disabled="state.index === state.order.length - 1" @click="go(1)">
        <ArrowRightIcon />
      </Button>
    </div>
    <p class="text-muted-foreground hidden text-center text-xs md:block">
      {{ t.flashKeys }}
    </p>
  </div>
</template>
