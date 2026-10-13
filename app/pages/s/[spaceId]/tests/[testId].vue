<script setup lang="ts">
import type { TestInput } from '#shared/schemas/test'
import type { Group } from '~/features/space/services/groups'
import type { Member } from '~/features/space/services/invites'
import type { Question } from '~/features/tests/services/questions'
import type { Test } from '~/features/tests/services/tests'
import { MAX_TEST_QUESTIONS, maxScoreOf, RESULT_RELEASE, testInput } from '#shared/schemas/test'
import { QUESTION_DIFFICULTY } from '#shared/schemas/question'
import { shuffle } from '#shared/study'
import { ArrowLeftIcon, Trash2Icon, TriangleAlertIcon, XIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { listGroups } from '~/features/space/services/groups'
import { listMembers } from '~/features/space/services/invites'
import { listQuestions } from '~/features/tests/services/questions'
import { createTest, deleteTest, getTest, setTestStatus, updateTest } from '~/features/tests/services/tests'
import { callFn } from '~/lib/functions'
import { errorMessage } from '~/lib/errors'
import { ko } from '~/locales/ko'

/** TST-10~16 시험 만들기·수정 (임시저장), 연 뒤에는 요약과 마감 */
const t = ko.exams
const f = t.fields
const p = t.picker
const route = useRoute()
const space = useSpaceStore()
const auth = useAuthStore()
const { $firestore, $functions } = useNuxtApp()

if (!space.current?.modules?.tests) {
  await navigateTo(`/s/${space.current!.id}`, { replace: true })
}

const sid = computed(() => space.current!.id)
const uid = computed(() => auth.user!.uid)
const personal = computed(() => space.current?.kind === 'personal')
const isNew = computed(() => route.params.testId === 'new')

const test = ref<Test | null>(null)
const questions = ref<Question[]>([])
const members = ref<Member[]>([])
const groups = ref<Group[]>([])
const loading = ref(true)
const busy = ref(false)

const empty = (): TestInput => testInput.parse({ title: '-' })
const form = ref<TestInput>({ ...empty(), title: '' })
const timeLimit = ref<number | ''>('')
const openAt = ref('')
const closeAt = ref('')
const randTag = ref('')
const randDiff = ref('')
const randCount = ref(5)

const editable = computed(() => isNew.value || (test.value?.status === 'draft' && test.value.hostIds.includes(uid.value)))
const byId = computed(() => new Map(questions.value.map(q => [q.id, q])))
const picked = computed(() => new Set(form.value.questionRefs.map(r => r.questionId)))
const total = computed(() => maxScoreOf(form.value.questionRefs))
const tags = computed(() => [...new Set(questions.value.flatMap(q => q.tags))].sort())
const revealed = computed(() => !form.value.settings.practice && form.value.questionRefs.some(r => byId.value.get(r.questionId)?.answerVisibility === 'space'))
const others = computed(() => members.value.filter(m => m.status === 'active' && m.uid !== uid.value))

const toLocal = (ms: number | null) => {
  if (ms == null) return ''
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000)
  return d.toISOString().slice(0, 16)
}
const fromLocal = (s: string) => (s ? new Date(s).getTime() : null)
const fmt = (ms: number) => new Date(ms).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

onMounted(async () => {
  try {
    const [q, m, g, tst] = await Promise.all([
      listQuestions($firestore, sid.value, uid.value),
      personal.value ? [] : listMembers($firestore, sid.value),
      personal.value ? [] : listGroups($firestore, sid.value).catch(() => []),
      isNew.value ? null : getTest($firestore, sid.value, String(route.params.testId)),
    ])
    questions.value = [...q.mine, ...q.shared]
    members.value = m
    groups.value = g
    if (!isNew.value && !tst) {
      toast.error(t.loadFailed)
      await navigateTo(`/s/${sid.value}/tests`, { replace: true })
      return
    }
    if (tst) {
      test.value = tst
      const { title, description, questionRefs, settings, assignees } = tst
      form.value = { title, description, questionRefs, settings: { ...settings }, assignees: { ...assignees, groupIds: assignees.groupIds ?? [] } }
      timeLimit.value = settings.timeLimitMin ?? ''
      openAt.value = toLocal(settings.openAt)
      closeAt.value = toLocal(settings.closeAt)
    }
  }
  catch {
    toast.error(t.loadFailed)
  }
  finally {
    loading.value = false
  }
})

function toggle(list: string[], x: string) {
  return list.includes(x) ? list.filter(y => y !== x) : [...list, x]
}

function addQuestion(q: Question) {
  if (picked.value.has(q.id) || form.value.questionRefs.length >= MAX_TEST_QUESTIONS) return
  form.value.questionRefs = [...form.value.questionRefs, { questionId: q.id, points: q.defaultPoints }]
}
function removeQuestion(id: string) {
  form.value.questionRefs = form.value.questionRefs.filter(r => r.questionId !== id)
}
function addRandom() {
  const pool = questions.value.filter(q => !picked.value.has(q.id) && (!randTag.value || q.tags.includes(randTag.value)) && (!randDiff.value || q.difficulty === randDiff.value))
  const room = MAX_TEST_QUESTIONS - form.value.questionRefs.length
  const chosen = shuffle(pool).slice(0, Math.min(Math.max(1, Math.floor(randCount.value || 1)), room))
  if (!chosen.length) {
    toast.error(p.none)
    return
  }
  chosen.forEach(addQuestion)
  toast.success(p.added(chosen.length))
}

function build() {
  return testInput.safeParse({
    ...form.value,
    settings: { ...form.value.settings, timeLimitMin: timeLimit.value === '' ? null : Number(timeLimit.value), openAt: fromLocal(openAt.value), closeAt: fromLocal(closeAt.value) },
    assignees: personal.value ? { all: true, uids: [], groupIds: [] } : form.value.assignees,
  })
}

async function save(): Promise<string | null> {
  const r = build()
  if (!r.success) {
    toast.error(ko.errors.invalidInput)
    return null
  }
  busy.value = true
  try {
    if (isNew.value) {
      const id = await createTest($firestore, sid.value, uid.value, r.data)
      toast.success(t.saved)
      await navigateTo(`/s/${sid.value}/tests/${id}`, { replace: true })
      return id
    }
    await updateTest($firestore, sid.value, test.value!.id, r.data)
    toast.success(t.saved)
    return test.value!.id
  }
  catch (e) {
    toast.error(errorMessage(e) ?? ko.errors.unknown)
    return null
  }
  finally {
    busy.value = false
  }
}

async function open() {
  if (!form.value.questionRefs.length) {
    toast.error(t.needQuestions)
    return
  }
  if (!(await confirmDialog(t.openConfirm))) return
  const id = await save()
  if (!id || isNew.value) return
  busy.value = true
  try {
    const res = await callFn($functions, 'openTest', { spaceId: sid.value, testId: id })
    toast.success(t.opened(res.takerCount))
    test.value = await getTest($firestore, sid.value, id)
  }
  catch (e) {
    toast.error(errorMessage(e) ?? ko.errors.unknown)
  }
  finally {
    busy.value = false
  }
}

async function close() {
  if (!(await confirmDialog(t.closeConfirm))) return
  try {
    await setTestStatus($firestore, sid.value, test.value!.id, 'closed')
    test.value = { ...test.value!, status: 'closed' }
    toast.success(t.closed)
  }
  catch (e) {
    toast.error(errorMessage(e) ?? ko.errors.unknown)
  }
}

async function remove() {
  if (!(await confirmDialog(t.deleteConfirm))) return
  try {
    await deleteTest($firestore, sid.value, test.value!.id)
    toast.success(t.deleted)
    await navigateTo(`/s/${sid.value}/tests`, { replace: true })
  }
  catch (e) {
    toast.error(errorMessage(e) ?? ko.errors.unknown)
  }
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 md:p-6">
    <div class="flex items-center gap-2">
      <Button variant="ghost" size="icon" class="size-8" as-child :aria-label="t.title">
        <NuxtLink :to="`/s/${sid}/tests`"><ArrowLeftIcon /></NuxtLink>
      </Button>
      <h1 class="flex-1 truncate text-xl font-semibold">{{ isNew ? t.create : (editable ? t.edit : test?.title) }}</h1>
      <Badge v-if="test" :variant="test.status === 'open' ? 'default' : 'secondary'">{{ t.status[test.status] }}</Badge>
      <Button v-if="test && test.hostIds.includes(uid)" variant="ghost" size="icon" class="size-8" :aria-label="ko.dialog.cancel" @click="remove">
        <Trash2Icon />
      </Button>
    </div>
    <p v-if="loading" class="text-muted-foreground text-sm">{{ t.loading }}</p>

    <template v-else-if="!editable && test">
      <p v-if="test.description" class="text-sm whitespace-pre-line">{{ test.description }}</p>
      <ul class="text-muted-foreground flex flex-col gap-1 text-sm">
        <li>{{ t.info(test.questionRefs.length, test.maxScore ?? maxScoreOf(test.questionRefs)) }}</li>
        <li>{{ test.settings.timeLimitMin ? t.minutes(test.settings.timeLimitMin) : t.noTimeLimit }} · {{ t.attempts(test.settings.maxAttempts) }}</li>
        <li v-if="test.settings.openAt || test.settings.closeAt">
          <template v-if="test.settings.openAt">{{ t.from(fmt(test.settings.openAt)) }} </template>
          <template v-if="test.settings.closeAt">{{ t.until(fmt(test.settings.closeAt)) }}</template>
        </li>
        <li>{{ f.resultRelease }}: {{ t.release[test.settings.resultRelease] }}</li>
        <li v-if="test.hostIds.includes(uid) && !personal">{{ t.takers(test.participantIds?.length ?? 0) }}</li>
      </ul>
      <p class="text-muted-foreground rounded-md border p-3 text-sm">{{ t.takeSoon }}</p>
      <Button v-if="test.status === 'open' && test.hostIds.includes(uid)" variant="outline" class="self-start" @click="close">{{ t.close }}</Button>
    </template>

    <form v-else class="flex flex-col gap-5" @submit.prevent="save">
      <div class="flex flex-col gap-2">
        <Label for="t-title">{{ f.title }}</Label>
        <Input id="t-title" v-model="form.title" maxlength="80" />
      </div>
      <div class="flex flex-col gap-2">
        <Label for="t-desc">{{ f.description }}</Label>
        <Textarea id="t-desc" v-model="form.description" rows="2" />
      </div>

      <section class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <Label>{{ f.questions }}</Label>
          <span class="text-muted-foreground text-xs">{{ p.selected(form.questionRefs.length, total) }}</span>
        </div>
        <ol v-if="form.questionRefs.length" class="flex flex-col divide-y rounded-md border">
          <li v-for="(r, i) in form.questionRefs" :key="r.questionId" class="flex items-center gap-2 p-2 text-sm">
            <span class="text-muted-foreground w-6 shrink-0 text-right">{{ i + 1 }}</span>
            <span class="line-clamp-1 flex-1">{{ byId.get(r.questionId)?.prompt ?? r.questionId }}</span>
            <TriangleAlertIcon v-if="!form.settings.practice && byId.get(r.questionId)?.answerVisibility === 'space'" class="size-4 shrink-0 text-amber-600" :aria-label="p.revealedWarning" />
            <Input v-model.number="r.points" type="number" min="1" max="100" class="h-7 w-16" :aria-label="ko.tests.fields.points" />
            <Button type="button" variant="ghost" size="icon" class="size-7" :aria-label="ko.dialog.cancel" @click="removeQuestion(r.questionId)"><XIcon /></Button>
          </li>
        </ol>
        <p v-if="revealed" class="flex items-center gap-1 text-xs text-amber-700"><TriangleAlertIcon class="size-3.5" /> {{ p.revealedWarning }}</p>
        <p v-if="!questions.length" class="text-muted-foreground text-sm">{{ p.empty }}</p>
        <template v-else>
          <div class="flex flex-wrap items-end gap-2 rounded-md border p-2">
            <div class="flex flex-col gap-1">
              <Label class="text-xs">{{ p.random }}</Label>
              <div class="flex flex-wrap gap-2">
                <select v-model="randTag" class="border-input h-8 rounded-md border bg-transparent px-2 text-sm" :aria-label="ko.tests.fields.tags">
                  <option value="">{{ p.anyTag }}</option>
                  <option v-for="tg in tags" :key="tg" :value="tg">#{{ tg }}</option>
                </select>
                <select v-model="randDiff" class="border-input h-8 rounded-md border bg-transparent px-2 text-sm" :aria-label="ko.tests.fields.difficulty">
                  <option value="">{{ p.anyDifficulty }}</option>
                  <option v-for="d in QUESTION_DIFFICULTY" :key="d" :value="d">{{ ko.tests.difficulty[d] }}</option>
                </select>
                <Input v-model.number="randCount" type="number" min="1" :max="MAX_TEST_QUESTIONS" class="h-8 w-20" :aria-label="p.count" />
                <Button type="button" size="sm" variant="outline" @click="addRandom">{{ p.add }}</Button>
              </div>
            </div>
          </div>
          <ul class="flex max-h-60 flex-col divide-y overflow-y-auto rounded-md border">
            <li v-for="q in questions" :key="q.id" class="flex items-center gap-2 p-2 text-sm">
              <input type="checkbox" class="size-4" :checked="picked.has(q.id)" :aria-label="q.prompt" @change="picked.has(q.id) ? removeQuestion(q.id) : addQuestion(q)">
              <Badge variant="outline" class="shrink-0">{{ ko.tests.types[q.type] }}</Badge>
              <span class="line-clamp-1 flex-1">{{ q.prompt }}</span>
              <span v-for="tg in q.tags.slice(0, 2)" :key="tg" class="text-muted-foreground text-xs">#{{ tg }}</span>
            </li>
          </ul>
        </template>
      </section>

      <section class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div class="flex flex-col gap-2">
          <Label for="t-limit">{{ f.timeLimit }}</Label>
          <Input id="t-limit" v-model.number="timeLimit" type="number" min="1" max="300" />
        </div>
        <div class="flex flex-col gap-2">
          <Label for="t-attempts">{{ f.maxAttempts }}</Label>
          <Input id="t-attempts" v-model.number="form.settings.maxAttempts" type="number" min="0" max="10" />
        </div>
        <div class="flex flex-col gap-2">
          <Label for="t-open">{{ f.openAt }}</Label>
          <Input id="t-open" v-model="openAt" type="datetime-local" />
        </div>
        <div class="flex flex-col gap-2">
          <Label for="t-close">{{ f.closeAt }}</Label>
          <Input id="t-close" v-model="closeAt" type="datetime-local" />
        </div>
      </section>
      <div v-if="form.settings.maxAttempts !== 1" class="flex flex-col gap-2">
        <Label>{{ f.scoring }}</Label>
        <div class="flex gap-1">
          <Button v-for="s in (['best', 'last'] as const)" :key="s" type="button" size="sm" :variant="form.settings.scoring === s ? 'default' : 'outline'" @click="form.settings.scoring = s">{{ t.scoring[s] }}</Button>
        </div>
      </div>
      <div class="flex flex-col gap-2">
        <Label>{{ f.resultRelease }}</Label>
        <div class="flex flex-wrap gap-1">
          <Button v-for="r in RESULT_RELEASE" :key="r" type="button" size="sm" :variant="form.settings.resultRelease === r ? 'default' : 'outline'" @click="form.settings.resultRelease = r">{{ t.release[r] }}</Button>
        </div>
      </div>
      <div class="flex flex-col gap-2 text-sm">
        <label class="flex items-center gap-2"><Switch v-model="form.settings.shuffleQuestions" /> {{ f.shuffleQuestions }}</label>
        <label class="flex items-center gap-2"><Switch v-model="form.settings.shuffleChoices" /> {{ f.shuffleChoices }}</label>
        <label class="flex items-center gap-2"><Switch v-model="form.settings.practice" /> {{ f.practice }}</label>
      </div>

      <div v-if="!personal" class="flex flex-col gap-2">
        <Label>{{ f.assignees }}</Label>
        <RadioGroup :model-value="form.assignees.all ? 'all' : 'pick'" class="flex gap-4" @update:model-value="(v) => form.assignees.all = v === 'all'">
          <label class="flex items-center gap-2 text-sm"><RadioGroupItem value="all" />{{ f.everyone }}</label>
          <label class="flex items-center gap-2 text-sm"><RadioGroupItem value="pick" />{{ f.pick }}</label>
        </RadioGroup>
        <div v-if="!form.assignees.all && groups.length" class="flex flex-wrap gap-x-4 gap-y-1 rounded-md border p-2">
          <label v-for="g in groups" :key="g.id" class="flex items-center gap-2 text-sm">
            <input type="checkbox" class="size-4" :checked="form.assignees.groupIds.includes(g.id)" @change="form.assignees.groupIds = toggle(form.assignees.groupIds, g.id)">
            {{ f.groupLabel(g.name) }}
          </label>
        </div>
        <div v-if="!form.assignees.all" class="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border p-2">
          <label v-for="m in others" :key="m.uid" class="flex items-center gap-2 text-sm">
            <input type="checkbox" class="size-4" :checked="form.assignees.uids.includes(m.uid)" @change="form.assignees.uids = toggle(form.assignees.uids, m.uid)">
            {{ m.displayName }}
          </label>
        </div>
      </div>

      <div class="flex justify-end gap-2">
        <Button type="submit" variant="outline" :disabled="busy">{{ t.save }}</Button>
        <Button v-if="!isNew" type="button" :disabled="busy || !form.questionRefs.length" @click="open">{{ t.open }}</Button>
      </div>
    </form>
  </div>
</template>
