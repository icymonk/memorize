<script setup lang="ts">
import type { GenFormat, GenItem } from '#shared/math/generate'
import type { ProblemSet } from '~/features/math/services/problemSets'
import { CURRICULUM, unitLabel } from '#shared/math/curriculum'
import { GEN_COUNTS } from '#shared/math/generate'
import { libraryFor } from '#shared/math/library'
import { newSeed } from '#shared/math/template'
import { PROBLEM_SET_MAX_QUESTIONS } from '#shared/schemas/problem-set'
import { ArrowLeftIcon, RefreshCwIcon, RepeatIcon, SparklesIcon, XIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import MathText from '~/features/math/components/MathText.vue'
import { listProblemSets } from '~/features/math/services/problemSets'
import { errorMessage } from '~/lib/errors'
import { callFn } from '~/lib/functions'
import { ko } from '~/locales/ko'

/** MATH-15 단원별 만들기: 학년 → 단원(→ 세부 개념), 난이도·개수·정답 형식 → 미리보기에서 빼기·숫자 다시·형식 바꾸기 → 문제집에 저장 */
const t = ko.math.gen
const space = useSpaceStore()
const auth = useAuthStore()
const { $firestore, $functions } = useNuxtApp()

if (!space.current?.modules?.math || !space.current?.modules?.tests) {
  await navigateTo(`/s/${space.current!.id}/math`, { replace: true })
}

const NONE = '_'
const sid = computed(() => space.current!.id)
const uid = computed(() => auth.user!.uid)
const personal = computed(() => space.current?.kind === 'personal')
const gradeCode = ref(NONE)
const unitCode = ref(NONE)
const conceptCode = ref(NONE)
const difficulty = ref('any')
const count = ref<number>(10)
const format = ref<GenFormat>('mix')

const grade = computed(() => CURRICULUM.grades.find(g => g.grade === gradeCode.value))
const unit = computed(() => grade.value?.areas.flatMap(a => a.units).find(u => u.code === unitCode.value))
const code = computed(() => (conceptCode.value !== NONE ? conceptCode.value : unitCode.value !== NONE ? unitCode.value : null))
watch(gradeCode, () => (unitCode.value = NONE))
watch(unitCode, () => (conceptCode.value = NONE))

const items = ref<GenItem[]>([])
const pool = ref<{ builtin: number, workspace: number } | null>(null)
const relaxed = ref(false)
const busy = ref(false)
const rowBusy = ref<number | null>(null)

async function make() {
  if (!code.value) return
  busy.value = true
  try {
    const r = await callFn($functions, 'generateProblems', { spaceId: sid.value, unitCode: code.value, difficulty: difficulty.value as 'any', count: count.value, format: format.value, seed: newSeed() })
    items.value = r.items
    pool.value = r.pool
    relaxed.value = r.relaxed
    title.value = unitLabel({ code: code.value, custom: null })
  }
  catch (e) {
    toast.error(errorMessage(e) ?? ko.errors.unknown)
  }
  finally {
    busy.value = false
  }
}
async function redraw(i: number, choice: boolean, seed: number) {
  rowBusy.value = i
  try {
    items.value[i] = await callFn($functions, 'previewTemplate', { spaceId: sid.value, source: items.value[i]!.source, choice, seed })
  }
  catch (e) {
    toast.error(errorMessage(e) ?? ko.errors.unknown)
  }
  finally {
    rowBusy.value = null
  }
}
const reroll = (i: number) => redraw(i, items.value[i]!.choice, newSeed())
const toggle = (i: number) => redraw(i, !items.value[i]!.choice, items.value[i]!.seed)
const remove = (i: number) => items.value.splice(i, 1)

const target = ref<'new' | 'existing'>('new')
const title = ref('')
const share = ref(false)
const sets = ref<ProblemSet[]>([])
const setId = ref(NONE)
const editable = computed(() => sets.value.filter(s => (s.createdBy === uid.value || (s.visibility === 'space' && s.editPolicy === 'members'))
  && s.questionIds.length + items.value.length <= PROBLEM_SET_MAX_QUESTIONS))
onMounted(async () => {
  sets.value = await listProblemSets($firestore, sid.value, uid.value).catch(() => [])
})
const canSave = computed(() => items.value.length > 0 && (target.value === 'new' ? !!title.value.trim() : setId.value !== NONE))

const saving = ref(false)
async function save() {
  saving.value = true
  try {
    const r = await callFn($functions, 'saveGenerated', {
      spaceId: sid.value,
      items: items.value.map(i => ({ source: i.source, choice: i.choice })),
      setId: target.value === 'existing' ? setId.value : null,
      title: target.value === 'new' ? title.value.trim() : null,
      unitCode: code.value,
      share: !personal.value && share.value,
    })
    toast.success(t.saved(r.added))
    await navigateTo(`/s/${sid.value}/math/${r.setId}`)
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
  <div class="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
    <div class="flex items-center gap-2">
      <Button variant="ghost" size="icon" class="size-8" as-child :aria-label="ko.math.nav">
        <NuxtLink :to="`/s/${sid}/math`"><ArrowLeftIcon /></NuxtLink>
      </Button>
      <h1 class="flex items-center gap-2 text-xl font-semibold"><SparklesIcon class="size-5" /> {{ t.title }}</h1>
    </div>
    <p class="text-muted-foreground text-sm">{{ t.intro }}</p>

    <Card>
      <CardContent class="flex flex-col gap-4 pt-6 text-sm">
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="flex flex-col gap-2">
            <Label for="gen-grade">{{ t.grade }}</Label>
            <Select v-model="gradeCode">
              <SelectTrigger id="gen-grade" class="w-full"><SelectValue :placeholder="t.pickGrade" /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="g in CURRICULUM.grades" :key="g.grade" :value="g.grade">{{ g.name }}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="flex flex-col gap-2">
            <Label for="gen-unit">{{ t.unit }}</Label>
            <Select v-model="unitCode" :disabled="!grade">
              <SelectTrigger id="gen-unit" class="w-full"><SelectValue :placeholder="t.pickUnit" /></SelectTrigger>
              <SelectContent>
                <SelectGroup v-for="a in grade?.areas ?? []" :key="a.name">
                  <SelectLabel>{{ a.name }}</SelectLabel>
                  <SelectItem v-for="u in a.units" :key="u.code" :value="u.code">
                    {{ u.name }}<span v-if="libraryFor(u.code).length" class="text-muted-foreground ml-1 text-xs">· {{ t.templates(libraryFor(u.code).length) }}</span>
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div v-if="unit?.children.length" class="flex flex-col gap-2">
          <Label for="gen-concept">{{ t.concept }}</Label>
          <Select v-model="conceptCode">
            <SelectTrigger id="gen-concept" class="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem :value="NONE">{{ t.wholeUnit }}</SelectItem>
              <SelectItem v-for="c in unit.children" :key="c.code" :value="c.code">{{ c.name }}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div class="flex flex-col gap-2">
          <span class="font-medium">{{ t.difficulty }}</span>
          <div class="flex flex-wrap gap-1">
            <Button v-for="d in ['any', 'easy', 'normal', 'hard']" :key="d" type="button" size="sm" :variant="difficulty === d ? 'default' : 'outline'" @click="difficulty = d">{{ t.difficulties[d] }}</Button>
          </div>
        </div>
        <div class="flex flex-wrap gap-6">
          <div class="flex flex-col gap-2">
            <span class="font-medium">{{ t.count }}</span>
            <div class="flex gap-1">
              <Button v-for="n in GEN_COUNTS" :key="n" type="button" size="sm" :variant="count === n ? 'default' : 'outline'" @click="count = n">{{ t.countN(n) }}</Button>
            </div>
          </div>
          <div class="flex flex-col gap-2">
            <span class="font-medium">{{ t.format }}</span>
            <div class="flex gap-1">
              <Button v-for="f in (['short', 'choice', 'mix'] as const)" :key="f" type="button" size="sm" :variant="format === f ? 'default' : 'outline'" @click="format = f">{{ t.formats[f] }}</Button>
            </div>
          </div>
        </div>
        <Button class="self-start" :disabled="!code || busy" @click="make"><SparklesIcon /> {{ items.length ? t.remake : t.make }}</Button>
      </CardContent>
    </Card>

    <template v-if="pool">
      <p class="text-muted-foreground text-xs">{{ t.pool(pool.builtin, pool.workspace) }}</p>
      <p v-if="relaxed" class="text-xs text-amber-600">{{ t.relaxed }}</p>
      <p v-if="!pool.builtin && !pool.workspace" class="text-muted-foreground text-sm">{{ t.empty }}</p>
      <ol v-else class="flex flex-col gap-2">
        <li v-for="(it, i) in items" :key="`${i}-${it.seed}`" class="flex items-start gap-2 rounded-md border p-3 text-sm" data-testid="gen-item">
          <span class="text-muted-foreground w-6 shrink-0">{{ i + 1 }}.</span>
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <p class="whitespace-pre-line" data-testid="gen-prompt"><MathText :text="it.prompt" /></p>
            <ol v-if="it.choice" class="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <li v-for="(c, j) in it.choices" :key="j" class="text-muted-foreground">{{ j + 1 }}) <MathText :text="c" /></li>
            </ol>
            <p v-if="it.answer != null" class="text-xs font-semibold text-emerald-600"><MathText :text="t.answerIs(it.answer)" /></p>
            <p v-else class="text-muted-foreground text-xs">{{ t.hiddenAnswer }}</p>
            <div class="flex flex-wrap items-center gap-1 text-xs">
              <Badge variant="secondary">{{ it.source.kind === 'builtin' ? t.builtin : t.workspace }}</Badge>
              <Badge variant="outline">{{ it.choice ? t.formats.choice : t.formats.short }}</Badge>
              <span v-if="it.name" class="text-muted-foreground">{{ it.name }}</span>
            </div>
          </div>
          <div class="flex shrink-0 flex-col gap-1 sm:flex-row">
            <Button variant="ghost" size="icon" class="size-8" :disabled="rowBusy === i" :aria-label="t.reroll" :title="t.reroll" @click="reroll(i)"><RefreshCwIcon /></Button>
            <Button v-if="it.canChoice" variant="ghost" size="icon" class="size-8" :disabled="rowBusy === i" :aria-label="it.choice ? t.toShort : t.toChoice" :title="it.choice ? t.toShort : t.toChoice" @click="toggle(i)"><RepeatIcon /></Button>
            <Button variant="ghost" size="icon" class="size-8" :aria-label="t.remove" :title="t.remove" @click="remove(i)"><XIcon /></Button>
          </div>
        </li>
      </ol>

      <Card v-if="items.length">
        <CardContent class="flex flex-col gap-3 pt-6 text-sm">
          <span class="font-medium">{{ t.target }}</span>
          <div class="flex gap-1">
            <Button type="button" size="sm" :variant="target === 'new' ? 'default' : 'outline'" @click="target = 'new'">{{ t.newSet }}</Button>
            <Button type="button" size="sm" :variant="target === 'existing' ? 'default' : 'outline'" @click="target = 'existing'">{{ t.existing }}</Button>
          </div>
          <template v-if="target === 'new'">
            <Label for="gen-title">{{ t.setTitle }}</Label>
            <Input id="gen-title" v-model="title" maxlength="80" />
            <label v-if="!personal" class="flex items-center gap-3">
              <Switch v-model="share" />
              <span>{{ t.share }}</span>
            </label>
          </template>
          <template v-else>
            <p v-if="!editable.length" class="text-muted-foreground">{{ t.noSets }}</p>
            <Select v-else v-model="setId">
              <SelectTrigger class="w-full" :aria-label="t.pickSet"><SelectValue :placeholder="t.pickSet" /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="s in editable" :key="s.id" :value="s.id">{{ s.title }}</SelectItem>
              </SelectContent>
            </Select>
            <label v-if="!personal" class="flex items-center gap-3">
              <Switch v-model="share" />
              <span>{{ ko.math.variant.share }}</span>
            </label>
          </template>
          <Button class="self-start" :disabled="!canSave || saving" @click="save">{{ t.save(items.length) }}</Button>
        </CardContent>
      </Card>
    </template>
  </div>
</template>
