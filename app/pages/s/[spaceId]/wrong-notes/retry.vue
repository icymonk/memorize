<script setup lang="ts">
import type { KeyValue } from '#shared/math/solve'
import type { CheckWrongOutput, WrongView } from '#shared/wrong-notes'
import { ArrowLeftIcon, CheckIcon, XIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import MathText from '~/features/math/components/MathText.vue'
import { errorMessage } from '~/lib/errors'
import { callFn } from '~/lib/functions'
import { ko } from '~/locales/ko'

/** WRN-20~22 오답 다시 풀기: 단어는 뜻을 보고 쓰기, 문제는 원래 형태로. 연속 2번 맞히면 해결 */
const t = ko.wrongNotes
const ox = ko.exams.take.ox
const route = useRoute()
const space = useSpaceStore()
const { $functions } = useNuxtApp()

if (!space.current?.modules?.wrongNotes) {
  await navigateTo(`/s/${space.current!.id}`, { replace: true })
}

const sid = computed(() => space.current!.id)
const ids = computed(() => String(route.query.ids ?? '').split(',').filter(Boolean).slice(0, 50))
const idx = ref(0)
const view = ref<WrongView | null>(null)
const answer = ref<KeyValue[] | KeyValue>('')
const result = ref<CheckWrongOutput | null>(null)
const busy = ref(false)
const solved = ref(0)
const finished = computed(() => idx.value >= ids.value.length)

async function open() {
  view.value = null
  result.value = null
  if (finished.value) return
  try {
    view.value = await callFn($functions, 'drawWrong', { spaceId: sid.value, noteId: ids.value[idx.value]! })
    answer.value = view.value.type === 'single' || view.value.type === 'multi' ? [] : ''
  }
  catch (e) {
    toast.error(errorMessage(e) ?? ko.errors.unknown)
  }
}
watch(idx, open, { immediate: true })

const answered = computed(() => Array.isArray(answer.value) ? answer.value.length > 0 : typeof answer.value === 'string' ? answer.value.trim() !== '' : true)
const picked = (i: number) => Array.isArray(answer.value) && (answer.value as number[]).includes(i)
function pick(i: number) {
  const cur = Array.isArray(answer.value) ? (answer.value as number[]) : []
  answer.value = view.value!.type === 'single' ? [i] : cur.includes(i) ? cur.filter(x => x !== i) : [...cur, i].sort()
}
async function check() {
  busy.value = true
  try {
    result.value = await callFn($functions, 'checkWrong', { spaceId: sid.value, noteId: view.value!.noteId, answer: answer.value as number[] | boolean | string })
    if (result.value.resolved) solved.value++
  }
  catch (e) {
    toast.error(errorMessage(e) ?? ko.errors.unknown)
  }
  finally {
    busy.value = false
  }
}
const next = () => idx.value++
</script>

<template>
  <div class="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
    <div class="flex items-center gap-2">
      <Button variant="ghost" size="icon" class="size-8" as-child :aria-label="t.back">
        <NuxtLink :to="`/s/${sid}/wrong-notes`"><ArrowLeftIcon /></NuxtLink>
      </Button>
      <h1 class="flex-1 text-xl font-semibold">{{ t.retryTitle }}</h1>
      <span v-if="!finished" class="text-muted-foreground text-sm">{{ idx + 1 }} / {{ ids.length }}</span>
    </div>

    <div v-if="finished" class="flex flex-col items-center gap-3 rounded-md border p-6 text-center">
      <p class="text-lg font-semibold">{{ t.done(solved, ids.length) }}</p>
      <Button as-child variant="outline"><NuxtLink :to="`/s/${sid}/wrong-notes`">{{ t.back }}</NuxtLink></Button>
    </div>
    <Skeleton v-else-if="!view" class="h-40 w-full" />
    <Card v-else>
      <CardContent class="flex flex-col gap-3 pt-6">
        <p v-if="view.type === 'card'" class="text-muted-foreground text-xs">{{ t.cardPrompt }}</p>
        <p class="text-lg whitespace-pre-line" data-testid="retry-prompt"><MathText :text="view.prompt" /></p>
        <p v-if="view.missing" class="text-muted-foreground text-sm">{{ t.missing }}</p>
        <template v-else>
          <div v-if="view.type === 'single' || view.type === 'multi'" class="flex flex-col gap-1">
            <label v-for="(c, i) in view.choices" :key="i" class="hover:bg-muted/50 flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm" :class="picked(i) ? 'border-primary bg-primary/5' : ''">
              <input :type="view.type === 'single' ? 'radio' : 'checkbox'" class="size-4" name="retry" :checked="picked(i)" :disabled="!!result" @change="pick(i)">
              <MathText :text="c" />
            </label>
          </div>
          <div v-else-if="view.type === 'ox'" class="flex gap-2">
            <Button v-for="v in [true, false]" :key="String(v)" class="w-16 text-lg" :disabled="!!result" :variant="answer === v ? 'default' : 'outline'" @click="answer = v">{{ ox[String(v)] }}</Button>
          </div>
          <Textarea v-else-if="view.type === 'essay'" :model-value="String(answer)" rows="4" :disabled="!!result" :aria-label="ko.exams.take.essayPlaceholder" @update:model-value="v => answer = String(v)" />
          <Input v-else :model-value="String(answer)" :disabled="!!result" :aria-label="ko.exams.take.shortPlaceholder" :placeholder="ko.exams.take.shortPlaceholder" @update:model-value="v => answer = String(v)" @keydown.enter.prevent="!busy && !result && answered && check()" />
        </template>

        <div v-if="result" class="bg-muted/50 flex flex-col gap-1 rounded-md p-3 text-sm" role="status">
          <p v-if="result.correct" class="flex items-center gap-1 font-medium text-green-700"><CheckIcon class="size-4" /> {{ t.correct }}</p>
          <p v-else class="text-destructive flex items-center gap-1 font-medium"><XIcon class="size-4" /> {{ t.wrong }}</p>
          <p v-if="result.resolved" class="font-medium">{{ t.nowResolved }}</p>
          <p v-else-if="result.correct" class="text-muted-foreground">{{ t.streak(result.consecutiveCorrect, 2) }}</p>
          <p v-if="result.answer"><MathText :text="t.answerIs(result.answer)" /></p>
          <p v-if="result.explanation" class="text-muted-foreground whitespace-pre-line"><MathText :text="result.explanation" /></p>
        </div>
        <div class="flex gap-2">
          <Button v-if="!result && !view.missing" :disabled="busy || !answered" @click="check">{{ t.check }}</Button>
          <Button v-if="result || view.missing" @click="next">{{ t.next }}</Button>
          <Button v-if="!result && !view.missing" variant="ghost" @click="next">{{ t.skip }}</Button>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
