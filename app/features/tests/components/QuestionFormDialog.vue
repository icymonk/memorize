<script setup lang="ts">
import type { QuestionType } from '#shared/schemas/question'
import type { Question } from '../services/questions'
import { CHOICES, keyFits, QUESTION_DIFFICULTY, QUESTION_TYPES, questionInput, questionKeyInput } from '#shared/schemas/question'
import { PlusIcon, XIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { errorMessage } from '~/lib/errors'
import { ko } from '~/locales/ko'
import { getQuestionKey, saveQuestion } from '../services/questions'

/** TST-01·02·07·08 문제 만들기·수정 */
const props = defineProps<{ question?: Question | null }>()
const emit = defineEmits<{ saved: [] }>()
const open = defineModel<boolean>('open', { default: false })

const t = ko.tests
const f = t.fields
const space = useSpaceStore()
const auth = useAuthStore()
const { $firestore } = useNuxtApp()
const personal = computed(() => space.current?.kind === 'personal')

const empty = () => ({
  type: 'single' as QuestionType,
  prompt: '',
  choices: ['', ''],
  correct: [] as number[],
  ox: true,
  accepted: '',
  ignoreCase: true,
  ignoreSpaces: false,
  rubric: '',
  explanation: '',
  tags: '',
  difficulty: 'normal' as (typeof QUESTION_DIFFICULTY)[number],
  points: 10,
  share: false,
  reveal: false,
})
const form = ref(empty())
const saving = ref(false)
const isChoice = computed(() => form.value.type === 'single' || form.value.type === 'multi')

watch(open, async (v) => {
  if (!v) return
  const q = props.question
  form.value = empty()
  if (!q) return
  const k = await getQuestionKey($firestore, space.current!.id, q.id)
  const a = k?.answer ?? []
  form.value = {
    ...empty(),
    type: q.type,
    prompt: q.prompt,
    choices: q.choices.length ? [...q.choices] : ['', ''],
    correct: a.filter((v): v is number => typeof v === 'number'),
    ox: a[0] !== false,
    accepted: a.filter((v): v is string => typeof v === 'string').join(', '),
    ignoreCase: k?.ignoreCase ?? true,
    ignoreSpaces: k?.ignoreSpaces ?? false,
    rubric: k?.rubric ?? '',
    explanation: k?.explanation ?? '',
    tags: q.tags.join(', '),
    difficulty: q.difficulty,
    points: q.defaultPoints,
    share: q.sharing === 'space',
    reveal: q.answerVisibility === 'space',
  }
})

function toggleCorrect(i: number) {
  const c = form.value.correct
  if (form.value.type === 'single') form.value.correct = [i]
  else form.value.correct = c.includes(i) ? c.filter(x => x !== i) : [...c, i].sort()
}
function removeChoice(i: number) {
  form.value.choices.splice(i, 1)
  form.value.correct = form.value.correct.filter(x => x !== i).map(x => x > i ? x - 1 : x)
}
const list = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean)

async function submit() {
  const v = form.value
  const q = questionInput.safeParse({
    type: v.type,
    prompt: v.prompt,
    choices: isChoice.value ? v.choices.map(c => c.trim()) : [],
    tags: [...new Set(list(v.tags))],
    difficulty: v.difficulty,
    defaultPoints: Number(v.points),
    sharing: !personal.value && v.share ? 'space' : 'private',
    answerVisibility: !personal.value && v.reveal ? 'space' : 'authors',
  })
  const answer = isChoice.value ? v.correct : v.type === 'ox' ? [v.ox] : v.type === 'short' ? list(v.accepted) : []
  const k = questionKeyInput.safeParse({ answer, ignoreCase: v.ignoreCase, ignoreSpaces: v.ignoreSpaces, explanation: v.explanation, rubric: v.type === 'essay' ? v.rubric : '' })
  if (!q.success || !k.success) {
    toast.error(ko.errors.invalidInput)
    return
  }
  if (!keyFits(q.data, k.data)) {
    toast.error(t.wrongKey)
    return
  }
  saving.value = true
  try {
    await saveQuestion($firestore, space.current!.id, auth.user!.uid, q.data, k.data, props.question)
    toast.success(t.saved)
    open.value = false
    emit('saved')
  }
  catch (e) {
    toast.error(errorMessage(e) ?? ko.errors.unknown)
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[90svh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{{ question ? t.edit : t.create }}</DialogTitle>
      </DialogHeader>
      <form class="flex flex-col gap-4" @submit.prevent="submit">
        <div class="flex flex-col gap-2">
          <Label>{{ f.type }}</Label>
          <div class="flex flex-wrap gap-1">
            <Button v-for="ty in QUESTION_TYPES" :key="ty" type="button" size="sm" :variant="form.type === ty ? 'default' : 'outline'" @click="form.type = ty; form.correct = []">
              {{ t.types[ty] }}
            </Button>
          </div>
        </div>
        <div class="flex flex-col gap-2">
          <Label for="q-prompt">{{ f.prompt }}</Label>
          <Textarea id="q-prompt" v-model="form.prompt" rows="3" />
        </div>
        <div v-if="isChoice" class="flex flex-col gap-2">
          <Label>{{ f.choices }} · {{ f.correct }}</Label>
          <div v-for="(_, i) in form.choices" :key="i" class="flex items-center gap-2">
            <button type="button" class="size-7 shrink-0 rounded-full border text-xs" :class="form.correct.includes(i) && 'bg-primary text-primary-foreground border-primary'" :aria-label="f.correct" @click="toggleCorrect(i)">
              {{ i + 1 }}
            </button>
            <Input v-model="form.choices[i]" class="h-8" />
            <Button v-if="form.choices.length > CHOICES.min" type="button" variant="ghost" size="icon" class="size-8" @click="removeChoice(i)">
              <XIcon />
            </Button>
          </div>
          <Button v-if="form.choices.length < CHOICES.max" type="button" variant="outline" size="sm" class="self-start" @click="form.choices.push('')">
            <PlusIcon /> {{ f.addChoice }}
          </Button>
        </div>
        <div v-else-if="form.type === 'ox'" class="flex flex-col gap-2">
          <Label>{{ f.correct }}</Label>
          <div class="flex gap-2">
            <Button type="button" :variant="form.ox ? 'default' : 'outline'" @click="form.ox = true">O</Button>
            <Button type="button" :variant="!form.ox ? 'default' : 'outline'" @click="form.ox = false">X</Button>
          </div>
        </div>
        <div v-else-if="form.type === 'short'" class="flex flex-col gap-2">
          <Label for="q-accepted">{{ f.accepted }}</Label>
          <Input id="q-accepted" v-model="form.accepted" />
          <div class="flex flex-wrap gap-4 text-sm">
            <label class="flex items-center gap-2"><Switch v-model="form.ignoreCase" /> {{ f.ignoreCase }}</label>
            <label class="flex items-center gap-2"><Switch v-model="form.ignoreSpaces" /> {{ f.ignoreSpaces }}</label>
          </div>
        </div>
        <div v-else class="flex flex-col gap-2">
          <Label for="q-rubric">{{ f.rubric }}</Label>
          <Textarea id="q-rubric" v-model="form.rubric" rows="2" />
        </div>
        <div class="flex flex-col gap-2">
          <Label for="q-explanation">{{ f.explanation }}</Label>
          <Textarea id="q-explanation" v-model="form.explanation" rows="2" />
        </div>
        <div class="grid grid-cols-3 gap-3">
          <div class="col-span-3 flex flex-col gap-2 sm:col-span-1">
            <Label for="q-points">{{ f.points }}</Label>
            <Input id="q-points" v-model.number="form.points" type="number" min="1" max="100" />
          </div>
          <div class="col-span-3 flex flex-col gap-2 sm:col-span-2">
            <Label>{{ f.difficulty }}</Label>
            <div class="flex gap-1">
              <Button v-for="d in QUESTION_DIFFICULTY" :key="d" type="button" size="sm" :variant="form.difficulty === d ? 'default' : 'outline'" @click="form.difficulty = d">
                {{ t.difficulty[d] }}
              </Button>
            </div>
          </div>
        </div>
        <div class="flex flex-col gap-2">
          <Label for="q-tags">{{ f.tags }}</Label>
          <Input id="q-tags" v-model="form.tags" />
        </div>
        <template v-if="!personal">
          <label class="flex items-start gap-3 text-sm">
            <Switch v-model="form.share" />
            <span class="flex flex-col"><span>{{ f.share }}</span><span class="text-muted-foreground text-xs">{{ f.shareHint }}</span></span>
          </label>
          <label class="flex items-start gap-3 text-sm">
            <Switch v-model="form.reveal" />
            <span class="flex flex-col"><span>{{ f.revealAnswer }}</span><span class="text-muted-foreground text-xs">{{ f.revealHint }}</span></span>
          </label>
        </template>
        <DialogFooter>
          <Button type="submit" :disabled="saving">{{ ko.dialog.ok }}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
