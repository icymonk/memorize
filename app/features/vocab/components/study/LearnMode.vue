<script setup lang="ts">
import CardWord from '../CardWord.vue'
import type { ModeResult } from './types'
import type { Grade, LearnItem } from '#shared/study'
import type { Card } from '~/features/vocab/services/cards'
import { gradeAnswer, makeChoices, nextLearnStage, nextRound, shuffle } from '#shared/study'
import { useStudyResume } from '~/features/vocab/composables/useStudyResume'
import { ko } from '~/locales/ko'
import AnswerFeedback from './AnswerFeedback.vue'

const props = defineProps<{ cards: Card[], resumeKey: string }>()
const emit = defineEmits<{ done: [ModeResult], answer: [cardId: string, correct: boolean, fix?: boolean] }>()
const t = ko.vocab.study

interface State { items: LearnItem[], missed: string[], roundNo: number, round: string[], pos: number, roundCorrect: number }
const resume = useStudyResume<State>(props.resumeKey)
const byId = computed(() => new Map(props.cards.map(c => [c.id, c])))

function fresh(): State {
  const items = shuffle(props.cards.map(c => ({ id: c.id, stage: 'choice' as const })))
  return { items, missed: [], roundNo: 1, round: nextRound(items), pos: 0, roundCorrect: 0 }
}
const saved = resume.load()
const valid = saved && saved.items.every(i => byId.value.has(i.id)) && saved.pos < saved.round.length
const state = ref<State>(valid ? saved : fresh())
const resumed = ref(!!valid && (saved!.pos > 0 || saved!.roundNo > 1))
const roundEnd = ref(false)
const grade = ref<Grade | null>(null)
const picked = ref<string | null>(null)
const input = ref('')

const item = computed(() => state.value.items.find(i => i.id === state.value.round[state.value.pos])!)
const card = computed(() => byId.value.get(item.value.id)!)
const choices = ref<string[]>([])
watch(item, (i) => {
  choices.value = makeChoices(byId.value.get(i.id)!.back[0]!, props.cards.filter(c => c.id !== i.id).map(c => c.back[0]!))
}, { immediate: true })

function answer(correct: boolean) {
  grade.value = correct ? 'exact' : 'wrong'
  record(correct)
}

function record(correct: boolean) {
  if (correct) state.value.roundCorrect++
  else if (!state.value.missed.includes(item.value.id)) state.value.missed.push(item.value.id)
  item.value.stage = nextLearnStage(item.value.stage, correct)
  emit('answer', item.value.id, correct)
}

function choose(c: string) {
  if (grade.value) return
  picked.value = c
  answer(c === card.value.back[0])
}

function check() {
  if (grade.value || !input.value.trim()) return
  grade.value = gradeAnswer(input.value, [card.value.front])
  record(grade.value !== 'wrong')
}

function override() {
  grade.value = 'exact'
  state.value.missed = state.value.missed.filter(id => id !== item.value.id)
  state.value.roundCorrect++
  item.value.stage = nextLearnStage(item.value.stage, true)
  emit('answer', item.value.id, true, true)
}

function next() {
  grade.value = null
  picked.value = null
  input.value = ''
  if (state.value.pos < state.value.round.length - 1) {
    state.value.pos++
    resume.save(state.value)
    return
  }
  if (state.value.items.every(i => i.stage === 'done')) {
    resume.clear()
    emit('done', { cards: state.value.items.length, correct: state.value.items.length - state.value.missed.length })
    return
  }
  roundEnd.value = true
}

function startRound() {
  const s = state.value
  s.roundNo++
  s.round = nextRound(s.items)
  s.pos = 0
  s.roundCorrect = 0
  roundEnd.value = false
  resume.save(s)
}

function restart() {
  state.value = fresh()
  resumed.value = false
  roundEnd.value = false
  grade.value = null
}

function onKey(e: KeyboardEvent) {
  if ((e.target as HTMLElement).closest('input, textarea')) return
  if (roundEnd.value && e.key === 'Enter') { e.preventDefault(); startRound(); return }
  if (grade.value && e.key === 'Enter') { e.preventDefault(); next(); return }
  const n = Number(e.key)
  if (item.value.stage === 'choice' && n >= 1 && n <= choices.value.length) choose(choices.value[n - 1]!)
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

const doneCount = computed(() => state.value.items.filter(i => i.stage === 'done').length)
</script>

<template>
  <div class="mx-auto flex w-full max-w-xl flex-col gap-4 p-4">
    <Teleport to="#focus-header">
      <span class="text-sm tabular-nums">{{ t.round(state.roundNo) }} · {{ doneCount }} / {{ state.items.length }}</span>
    </Teleport>
    <p v-if="resumed" class="text-muted-foreground text-center text-xs">
      {{ t.resumed }}
      <button class="underline" @click="restart">
        {{ t.restart }}
      </button>
    </p>

    <div v-if="roundEnd" class="flex flex-col items-center gap-4 py-10 text-center">
      <p class="text-lg font-medium">
        {{ t.roundResult(state.roundCorrect, state.round.length) }}
      </p>
      <Button size="lg" @click="startRound">
        {{ t.nextRound }}
      </Button>
    </div>

    <template v-else-if="item.stage === 'choice' || (grade && picked !== null)">
      <p class="text-muted-foreground text-sm">
        {{ t.chooseMeaning }}
      </p>
      <div class="bg-card rounded-2xl border p-6 text-center text-3xl font-semibold">
        <CardWord :front="card.front" :reading="card.reading" />
      </div>
      <div class="grid gap-2 sm:grid-cols-2">
        <Button
          v-for="(c, i) in choices"
          :key="c"
          variant="outline"
          class="h-auto justify-start py-3 text-left whitespace-normal"
          :class="grade && (c === card.back[0] ? 'border-emerald-500 bg-emerald-500/10' : c === picked ? 'border-destructive bg-destructive/10' : '')"
          @click="choose(c)"
        >
          <span class="text-muted-foreground mr-2 text-xs">{{ i + 1 }}</span>{{ c }}
        </Button>
      </div>
    </template>

    <template v-else>
      <p class="text-muted-foreground text-sm">
        {{ t.typeWord }}
      </p>
      <div class="bg-card rounded-2xl border p-6 text-center text-2xl">
        {{ card.back.join(', ') }}
      </div>
      <form class="flex gap-2" @submit.prevent="grade ? next() : check()">
        <Input v-model="input" :placeholder="t.answerPlaceholder" autofocus autocomplete="off" autocapitalize="off" spellcheck="false" :readonly="!!grade" />
        <Button v-if="!grade" type="submit">
          {{ t.check }}
        </Button>
      </form>
    </template>

    <AnswerFeedback v-if="grade && !roundEnd" :grade="grade" :answer="picked !== null ? card.back[0]! : card.front" :can-override="picked === null" @next="next" @override="override" />
  </div>
</template>
