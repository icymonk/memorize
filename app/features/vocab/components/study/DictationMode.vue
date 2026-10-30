<script setup lang="ts">
import type { ModeResult } from './types'
import type { Grade } from '#shared/study'
import type { Card } from '~/features/vocab/services/cards'
import { gradeAnswer, shuffle } from '#shared/study'
import { useSpeech } from '~/features/vocab/composables/useSpeech'
import { useStudyResume } from '~/features/vocab/composables/useStudyResume'
import { ko } from '~/locales/ko'
import { Volume2Icon } from '@lucide/vue'
import AnswerFeedback from './AnswerFeedback.vue'

/** VOC-24 받아쓰기: 발음을 듣고 철자를 쓴다. 뜻은 채점 뒤에 보여 준다 */
const props = defineProps<{ cards: Card[], resumeKey: string, lang: Parameters<ReturnType<typeof useSpeech>['speak']>[1] }>()
const emit = defineEmits<{ done: [ModeResult], answer: [cardId: string, correct: boolean, fix?: boolean] }>()
const t = ko.vocab.study

interface State { order: string[], index: number, correct: number }
const resume = useStudyResume<State>(props.resumeKey)
const byId = computed(() => new Map(props.cards.map(c => [c.id, c])))
const saved = resume.load()
const valid = saved && saved.order.every(id => byId.value.has(id)) && saved.index < saved.order.length
const state = ref<State>(valid ? saved : { order: shuffle(props.cards.map(c => c.id)), index: 0, correct: 0 })
const resumed = ref(!!valid && saved!.index > 0)
const input = ref('')
const grade = ref<Grade | null>(null)
const card = computed(() => byId.value.get(state.value.order[state.value.index]!)!)
const speech = useSpeech()
const play = () => speech.speak(card.value.reading || card.value.front, props.lang)
watch(card, play)
onMounted(play)

function check() {
  if (grade.value || !input.value.trim()) return
  grade.value = gradeAnswer(input.value, [card.value.front])
  if (grade.value !== 'wrong') state.value.correct++
  emit('answer', card.value.id, grade.value !== 'wrong')
}

function override() {
  grade.value = 'exact'
  state.value.correct++
  emit('answer', card.value.id, true, true)
}

function next() {
  grade.value = null
  input.value = ''
  if (state.value.index === state.value.order.length - 1) {
    resume.clear()
    emit('done', { cards: state.value.order.length, correct: state.value.correct })
    return
  }
  state.value.index++
  resume.save(state.value)
}

function onEnter() {
  if (grade.value) next()
  else check()
}

function restart() {
  state.value = { order: shuffle(props.cards.map(c => c.id)), index: 0, correct: 0 }
  resumed.value = false
  grade.value = null
  input.value = ''
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-xl flex-col gap-4 p-4">
    <Teleport to="#focus-header">
      <span class="text-sm tabular-nums">{{ state.index + 1 }} / {{ state.order.length }}</span>
    </Teleport>
    <p v-if="resumed" class="text-muted-foreground text-center text-xs">
      {{ t.resumed }}
      <button class="underline" @click="restart">
        {{ t.restart }}
      </button>
    </p>
    <p class="text-muted-foreground text-sm">
      {{ t.listenType }}
    </p>
    <div class="bg-card flex flex-col items-center gap-2 rounded-2xl border p-6 text-center">
      <Button size="lg" variant="secondary" :aria-label="t.play" @click="play">
        <Volume2Icon /> {{ t.play }}
      </Button>
      <p v-if="grade" class="text-muted-foreground text-lg">
        {{ card.back.join(', ') }}
      </p>
    </div>
    <form class="flex gap-2" @submit.prevent="onEnter">
      <Input v-model="input" :placeholder="t.answerPlaceholder" autofocus autocomplete="off" autocapitalize="off" spellcheck="false" :readonly="!!grade" />
      <Button v-if="!grade" type="submit">
        {{ t.check }}
      </Button>
    </form>
    <AnswerFeedback v-if="grade" :grade="grade" :answer="card.front" can-override @next="next" @override="override" />
  </div>
</template>
