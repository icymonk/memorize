<script setup lang="ts">
import type { Template, TemplateDraft, TemplateIssue, TemplateVar } from '#shared/math/template'
import type { Question } from '~/features/tests/services/questions'
import { PRESETS } from '#shared/math/presets'
import { checkTemplate, drawProblem, newSeed, previewTemplate, templateInput } from '#shared/math/template'
import { keyFits, questionInput, questionKeyInput } from '#shared/schemas/question'
import { PlusIcon, RefreshCwIcon, XIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { getQuestionKey, saveQuestion } from '~/features/tests/services/questions'
import { errorMessage } from '~/lib/errors'
import { ko } from '~/locales/ko'
import MathText from './MathText.vue'

/** MATH-14 변형 문제 만들기: 지문 틀 + 숫자 자리 + 계산값·조건 + 정답·오답 식. 저장하면 목록용 예시 1개와 틀(정답 문서)을 함께 남긴다 */
const props = defineProps<{ question?: Question | null, preset?: { unit?: Question['unit'], share?: boolean } }>()
const emit = defineEmits<{ saved: [id: string] }>()
const open = defineModel<boolean>('open', { default: false })

const t = ko.math.variant
const space = useSpaceStore()
const auth = useAuthStore()
const { $firestore } = useNuxtApp()
const personal = computed(() => space.current?.kind === 'personal')

interface VarRow { name: string, kind: TemplateVar['kind'], min: string, max: string, step: string, digits: string, exclude: string, options: string }
const row = (v?: Partial<TemplateVar>): VarRow => ({
  name: v?.name ?? '',
  kind: v?.kind ?? 'int',
  min: String(v?.min ?? (v?.kind === 'frac' ? 2 : 1)),
  max: String(v?.max ?? 9),
  step: v?.step ? String(v.step) : '',
  digits: v?.digits ? String(v.digits) : '',
  exclude: (v?.exclude ?? []).join(', '),
  options: (v?.options ?? []).join(', '),
})
const empty = () => ({
  presetId: '_',
  choice: false,
  prompt: '',
  vars: [row({ name: 'a' }), row({ name: 'b' })],
  calc: [] as { name: string, expr: string }[],
  conds: [] as string[],
  answerExpr: '',
  wrongExprs: [] as string[],
  explanation: '',
  tolerance: 0,
  share: false,
})
const form = ref(empty())
const seed = ref(newSeed())
const saving = ref(false)
const loadingKey = ref(false)
const unitFromPreset = ref<Question['unit']>(null)

function fill(d: TemplateDraft, choice: boolean) {
  Object.assign(form.value, {
    choice,
    prompt: d.prompt,
    vars: d.vars.map(v => row(v)),
    calc: (d.calc ?? []).map(c => ({ ...c })),
    conds: [...(d.conds ?? [])],
    answerExpr: d.answerExpr,
    wrongExprs: [...(d.wrongExprs ?? [])],
    explanation: d.explanation ?? '',
  })
}

watch(open, async (v) => {
  if (!v) return
  form.value = { ...empty(), share: !!props.preset?.share }
  unitFromPreset.value = null
  seed.value = newSeed()
  const q = props.question
  if (!q) return
  form.value.share = q.sharing === 'space'
  loadingKey.value = true
  try {
    const k = await getQuestionKey($firestore, space.current!.id, q.id)
    if (k?.template) fill(k.template, q.type === 'single')
    form.value.tolerance = k?.tolerance ?? 0
  }
  finally {
    loadingKey.value = false
  }
})

function applyPreset(id: unknown) {
  const p = PRESETS.find(x => x.id === id)
  if (!p) return
  fill(p.template, p.choice)
  unitFromPreset.value = { code: p.unit, custom: null }
  seed.value = newSeed()
}

const nums = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean).map(Number)
const draft = computed(() => {
  const f = form.value
  return templateInput.safeParse({
    prompt: f.prompt,
    explanation: f.explanation,
    hints: [],
    vars: f.vars.map(v => ({
      name: v.name.trim(),
      kind: v.kind,
      min: Number(v.min),
      max: Number(v.max),
      step: v.kind === 'int' && v.step.trim() ? Number(v.step) : null,
      digits: v.kind === 'dec' && v.digits.trim() ? Number(v.digits) : null,
      exclude: v.kind === 'int' || v.kind === 'dec' ? nums(v.exclude) : [],
      options: v.kind === 'pick' ? v.options.split(',').map(x => x.trim()).filter(Boolean) : [],
    })),
    calc: f.calc.map(c => ({ name: c.name.trim(), expr: c.expr })),
    conds: f.conds.filter(c => c.trim()),
    answerExpr: f.answerExpr,
    wrongExprs: f.choice ? f.wrongExprs.filter(w => w.trim()) : [],
  })
})
const issues = computed<(TemplateIssue | { code: 'input' | 'wrongs', at: string })[]>(() => {
  if (!draft.value.success) return [{ code: 'input', at: '' }]
  const out: (TemplateIssue | { code: 'wrongs', at: string })[] = checkTemplate(draft.value.data)
  if (form.value.choice && !draft.value.data.wrongExprs.length) out.push({ code: 'wrongs', at: '' })
  return out
})
const template = computed<Template | null>(() => (draft.value.success && !issues.value.length ? draft.value.data : null))
const preview = computed(() => (template.value ? previewTemplate(template.value, form.value.choice, seed.value) : null))
const CHECKS = 20

function issueText(i: { code: keyof typeof t.issues, at: string }) {
  const [kind, name] = i.at.split(':') as [keyof typeof t.at | '', string | undefined]
  const where = kind ? `${t.at[kind]}${name && kind !== 'cond' && kind !== 'wrong' ? ` ${name}` : name ? ` ${Number(name) + 1}` : ''}: ` : ''
  return where + t.issues[i.code]
}

async function submit() {
  const tpl = template.value
  if (!tpl || !preview.value || preview.value.failed) return
  const choice = form.value.choice
  const r = drawProblem(tpl, newSeed(), choice)
  if (!r.ok) {
    toast.error(t.failed(1, 1))
    return
  }
  const old = props.question
  const q = questionInput.safeParse({
    type: choice ? 'single' : 'short',
    prompt: r.problem.prompt,
    choices: choice ? r.problem.choices : [],
    tags: old?.tags ?? [],
    subjectId: old?.subjectId ?? null,
    media: [],
    difficulty: old?.difficulty ?? 'normal',
    defaultPoints: old?.defaultPoints ?? 10,
    sharing: !personal.value && form.value.share ? 'space' : 'private',
    answerVisibility: 'authors',
    unit: old?.unit ?? props.preset?.unit ?? unitFromPreset.value ?? null,
    variant: true,
  })
  const k = questionKeyInput.safeParse({
    answer: choice ? [r.problem.answerIndex] : [r.problem.answer],
    ignoreCase: true,
    ignoreSpaces: false,
    explanation: r.problem.explanation,
    rubric: '',
    tolerance: choice ? null : Math.max(0, Number(form.value.tolerance) || 0),
    template: tpl,
  })
  if (!q.success || !k.success || !keyFits(q.data, k.data)) {
    toast.error(ko.errors.invalidInput)
    return
  }
  saving.value = true
  try {
    const id = await saveQuestion($firestore, space.current!.id, auth.user!.uid, q.data, k.data, old)
    toast.success(t.saved)
    open.value = false
    emit('saved', id)
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
    <DialogContent class="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{{ question ? t.editTitle : t.createTitle }}</DialogTitle>
        <DialogDescription>{{ t.intro }}</DialogDescription>
      </DialogHeader>
      <Skeleton v-if="loadingKey" class="h-40 w-full" />
      <form v-else id="variant-form" class="flex flex-col gap-4 text-sm" @submit.prevent="submit">
        <div v-if="!question" class="flex flex-col gap-2">
          <Label for="v-preset">{{ t.preset }}</Label>
          <Select v-model="form.presetId" @update:model-value="applyPreset">
            <SelectTrigger id="v-preset" class="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_">{{ t.presetNone }}</SelectItem>
              <SelectItem v-for="p in PRESETS" :key="p.id" :value="p.id">{{ p.name }}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div class="flex flex-col gap-2">
          <Label>{{ t.format }}</Label>
          <div class="flex gap-1">
            <Button type="button" size="sm" :variant="!form.choice ? 'default' : 'outline'" @click="form.choice = false">{{ t.short }}</Button>
            <Button type="button" size="sm" :variant="form.choice ? 'default' : 'outline'" @click="form.choice = true">{{ t.choice }}</Button>
          </div>
        </div>
        <div class="flex flex-col gap-2">
          <Label for="v-prompt">{{ t.prompt }}</Label>
          <Textarea id="v-prompt" v-model="form.prompt" rows="3" maxlength="2000" />
          <p class="text-muted-foreground text-xs">{{ t.promptHint }}</p>
        </div>

        <fieldset class="flex flex-col gap-2">
          <legend class="mb-2 font-medium">{{ t.vars }}</legend>
          <div v-for="(v, i) in form.vars" :key="i" class="flex flex-col gap-2 rounded-md border p-2" :data-testid="`var-${i}`">
            <div class="flex items-center gap-1">
              <Input v-model="v.name" class="h-8 w-16" maxlength="8" :aria-label="t.name" />
              <Select v-model="v.kind">
                <SelectTrigger class="h-8 w-24" :aria-label="t.vars"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="(label, k) in t.kinds" :key="k" :value="k">{{ label }}</SelectItem>
                </SelectContent>
              </Select>
              <template v-if="v.kind !== 'pick'">
                <Input v-model="v.min" class="h-8 min-w-0 flex-1" inputmode="decimal" :aria-label="v.kind === 'frac' ? t.denMin : t.min" :placeholder="v.kind === 'frac' ? t.denMin : t.min" />
                <span>~</span>
                <Input v-model="v.max" class="h-8 min-w-0 flex-1" inputmode="decimal" :aria-label="v.kind === 'frac' ? t.denMax : t.max" :placeholder="v.kind === 'frac' ? t.denMax : t.max" />
              </template>
              <Input v-else v-model="v.options" class="h-8 min-w-0 flex-1" :aria-label="t.options" :placeholder="t.options" />
              <Button type="button" variant="ghost" size="icon" class="size-8 shrink-0" :disabled="form.vars.length <= 1" :aria-label="ko.dialog.cancel" @click="form.vars.splice(i, 1)"><XIcon /></Button>
            </div>
            <div v-if="v.kind === 'int' || v.kind === 'dec'" class="flex items-center gap-1">
              <Input v-if="v.kind === 'int'" v-model="v.step" class="h-8 w-20" inputmode="decimal" :aria-label="t.step" :placeholder="t.step" />
              <Input v-else v-model="v.digits" class="h-8 w-20" inputmode="numeric" :aria-label="t.digits" :placeholder="t.digits" />
              <Input v-model="v.exclude" class="h-8 min-w-0 flex-1" :aria-label="t.exclude" :placeholder="t.exclude" />
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" class="self-start" :disabled="form.vars.length >= 10" @click="form.vars.push(row({ name: '' }))"><PlusIcon /> {{ t.addVar }}</Button>
        </fieldset>

        <fieldset class="flex flex-col gap-2">
          <legend class="mb-2 font-medium">{{ t.calc }}</legend>
          <div v-for="(c, i) in form.calc" :key="i" class="flex items-center gap-1">
            <Input v-model="c.name" class="h-8 w-16" maxlength="8" :aria-label="t.name" />
            <span>=</span>
            <Input v-model="c.expr" class="h-8 min-w-0 flex-1 font-mono" :aria-label="`${t.calc} ${c.name}`" />
            <Button type="button" variant="ghost" size="icon" class="size-8" :aria-label="ko.dialog.cancel" @click="form.calc.splice(i, 1)"><XIcon /></Button>
          </div>
          <Button type="button" variant="outline" size="sm" class="self-start" :disabled="form.calc.length >= 10" @click="form.calc.push({ name: '', expr: '' })"><PlusIcon /> {{ t.addCalc }}</Button>
        </fieldset>

        <fieldset class="flex flex-col gap-2">
          <legend class="mb-1 font-medium">{{ t.conds }}</legend>
          <p class="text-muted-foreground text-xs">{{ t.condsHint }}</p>
          <div v-for="(_, i) in form.conds" :key="i" class="flex items-center gap-1">
            <Input v-model="form.conds[i]" class="h-8 min-w-0 flex-1 font-mono" :aria-label="`${t.conds} ${i + 1}`" />
            <Button type="button" variant="ghost" size="icon" class="size-8" :aria-label="ko.dialog.cancel" @click="form.conds.splice(i, 1)"><XIcon /></Button>
          </div>
          <Button type="button" variant="outline" size="sm" class="self-start" :disabled="form.conds.length >= 10" @click="form.conds.push('')"><PlusIcon /> {{ t.addCond }}</Button>
        </fieldset>

        <div class="flex flex-col gap-2">
          <Label for="v-answer">{{ t.answer }}</Label>
          <div class="flex items-center gap-2">
            <Input id="v-answer" v-model="form.answerExpr" class="h-8 min-w-0 flex-1 font-mono" />
            <template v-if="!form.choice">
              <Label for="v-tol" class="shrink-0 text-xs">{{ t.tolerance }}</Label>
              <Input id="v-tol" v-model.number="form.tolerance" type="number" min="0" step="any" class="h-8 w-20" />
            </template>
          </div>
        </div>

        <fieldset v-if="form.choice" class="flex flex-col gap-2">
          <legend class="mb-1 font-medium">{{ t.wrongs }}</legend>
          <p class="text-muted-foreground text-xs">{{ t.wrongsHint }}</p>
          <div v-for="(_, i) in form.wrongExprs" :key="i" class="flex items-center gap-1">
            <Input v-model="form.wrongExprs[i]" class="h-8 min-w-0 flex-1 font-mono" :aria-label="`${t.wrongs} ${i + 1}`" />
            <Button type="button" variant="ghost" size="icon" class="size-8" :aria-label="ko.dialog.cancel" @click="form.wrongExprs.splice(i, 1)"><XIcon /></Button>
          </div>
          <Button type="button" variant="outline" size="sm" class="self-start" :disabled="form.wrongExprs.length >= 5" @click="form.wrongExprs.push('')"><PlusIcon /> {{ t.addWrong }}</Button>
        </fieldset>

        <div class="flex flex-col gap-2">
          <Label for="v-expl">{{ t.explanation }}</Label>
          <Textarea id="v-expl" v-model="form.explanation" rows="2" maxlength="2000" />
        </div>
        <p class="text-muted-foreground text-xs">{{ t.exprHelp }}</p>

        <label v-if="!personal" class="flex items-center gap-3">
          <Switch v-model="form.share" />
          <span>{{ t.share }}</span>
        </label>

        <section class="bg-muted/40 flex flex-col gap-2 rounded-md p-3" data-testid="variant-preview">
          <div class="flex items-center justify-between">
            <span class="font-medium">{{ t.preview }}</span>
            <Button type="button" variant="outline" size="sm" :disabled="!preview" @click="seed = newSeed()"><RefreshCwIcon /> {{ t.reroll }}</Button>
          </div>
          <ul v-if="issues.length" class="text-destructive flex list-disc flex-col gap-1 pl-5 text-xs">
            <li v-for="(i, n) in issues" :key="n">{{ issueText(i) }}</li>
          </ul>
          <template v-else-if="preview">
            <p v-if="preview.failed" class="text-destructive text-xs">{{ t.failed(preview.failed, CHECKS) }}</p>
            <p v-else-if="preview.acceptRate < 0.05" class="text-xs text-amber-600">{{ t.tight }}</p>
            <ol class="flex flex-col gap-2">
              <li v-for="(s, i) in preview.samples" :key="i" class="bg-background rounded border p-2" data-testid="variant-sample">
                <p class="whitespace-pre-line"><MathText :text="s.prompt" /></p>
                <ol v-if="form.choice" class="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  <li v-for="(c, j) in s.choices" :key="j" :class="j === s.answerIndex ? 'font-semibold text-emerald-600' : 'text-muted-foreground'">{{ j + 1 }}) <MathText :text="c" /></li>
                </ol>
                <p v-else class="mt-1 text-xs font-semibold text-emerald-600">{{ t.answerIs(s.answer) }}</p>
              </li>
            </ol>
          </template>
        </section>
      </form>
      <DialogFooter>
        <Button type="submit" form="variant-form" :disabled="saving || loadingKey || !preview || !!preview.failed">{{ ko.dialog.ok }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
