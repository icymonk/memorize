<script setup lang="ts">
import type { ProblemSet } from '~/features/math/services/problemSets'
import type { Question } from '~/features/tests/services/questions'
import { unitLabel } from '#shared/math/curriculum'
import { PROBLEM_SET_MAX_QUESTIONS } from '#shared/schemas/problem-set'
import { ArrowLeftIcon, ListPlusIcon, PencilIcon, PlusIcon, Trash2Icon, XIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import MathText from '~/features/math/components/MathText.vue'
import ProblemSetFormDialog from '~/features/math/components/ProblemSetFormDialog.vue'
import { addToSet, deleteProblemSet, getProblemSet, removeFromSet } from '~/features/math/services/problemSets'
import QuestionFormDialog from '~/features/tests/components/QuestionFormDialog.vue'
import { getQuestions, listQuestions } from '~/features/tests/services/questions'
import { errorMessage } from '~/lib/errors'
import { ko } from '~/locales/ko'

/** MATH-10 문제집 상세: 문제 목록, 새 문제·문제 은행에서 넣기. 풀기는 M4 */
const t = ko.math.set
const route = useRoute()
const space = useSpaceStore()
const auth = useAuthStore()
const { $firestore } = useNuxtApp()

if (!space.current?.modules?.math || !space.current?.modules?.tests) {
  await navigateTo(`/s/${space.current!.id}/math`, { replace: true })
}

const sid = computed(() => space.current!.id)
const setId = computed(() => String(route.params.setId))
const uid = computed(() => auth.user!.uid)
const set = ref<ProblemSet | null>(null)
const questions = ref<Question[]>([])
const hidden = ref(0)
const loading = ref(true)
const busy = ref(false)
const editOpen = ref(false)
const newOpen = ref(false)
const pickOpen = ref(false)
const pickList = ref<Question[]>([])
const picked = ref<string[]>([])
const pickLoading = ref(false)

const owner = computed(() => set.value?.createdBy === uid.value)
const canEdit = computed(() => owner.value || (set.value?.visibility === 'space' && set.value.editPolicy === 'members'))
const full = computed(() => (set.value?.questionIds.length ?? 0) >= PROBLEM_SET_MAX_QUESTIONS)

async function load() {
  loading.value = true
  try {
    set.value = await getProblemSet($firestore, sid.value, setId.value)
    if (set.value) {
      const r = await getQuestions($firestore, sid.value, set.value.questionIds)
      questions.value = r.list
      hidden.value = r.hidden
    }
  }
  catch {
    set.value = null
  }
  finally {
    loading.value = false
  }
}
onMounted(load)

async function run(fn: () => Promise<unknown>, done: string) {
  busy.value = true
  try {
    await fn()
    toast.success(done)
    await load()
  }
  catch (e) {
    toast.error(errorMessage(e) ?? ko.errors.unknown)
  }
  finally {
    busy.value = false
  }
}

const added = (id: string) => run(() => addToSet($firestore, sid.value, setId.value, [id]), t.added(1))
const remove = (q: Question) => run(() => removeFromSet($firestore, sid.value, setId.value, q.id), t.removed)

async function openPick() {
  pickOpen.value = true
  picked.value = []
  pickLoading.value = true
  try {
    const { mine, shared } = await listQuestions($firestore, sid.value, uid.value)
    const inSet = new Set(set.value?.questionIds)
    const seen = new Set<string>()
    pickList.value = [...mine, ...shared].filter(q => !inSet.has(q.id) && !seen.has(q.id) && seen.add(q.id))
  }
  finally {
    pickLoading.value = false
  }
}
async function addPicked() {
  const room = PROBLEM_SET_MAX_QUESTIONS - (set.value?.questionIds.length ?? 0)
  if (picked.value.length > room) {
    toast.error(t.full)
    return
  }
  const ids = [...picked.value]
  pickOpen.value = false
  await run(() => addToSet($firestore, sid.value, setId.value, ids), t.added(ids.length))
}
const togglePick = (id: string, on: boolean) => {
  picked.value = on ? [...picked.value, id] : picked.value.filter(x => x !== id)
}

async function remove_() {
  if (!(await confirmDialog(t.deleteConfirm))) return
  busy.value = true
  try {
    await deleteProblemSet($firestore, sid.value, setId.value)
    toast.success(t.deleted)
    await navigateTo(`/s/${sid.value}/math`)
  }
  catch (e) {
    toast.error(errorMessage(e) ?? ko.errors.unknown)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
    <Button as-child variant="ghost" size="sm" class="self-start">
      <NuxtLink :to="`/s/${sid}/math`"><ArrowLeftIcon /> {{ ko.math.nav }}</NuxtLink>
    </Button>
    <Skeleton v-if="loading && !set" class="h-32 w-full" />
    <p v-else-if="!set" class="text-muted-foreground text-sm">{{ t.notFound }}</p>
    <template v-else>
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div class="flex min-w-0 flex-col gap-1">
          <h1 class="flex items-center gap-2 text-xl font-semibold">
            <span class="truncate">{{ set.title }}</span>
            <Badge variant="secondary">{{ set.visibility === 'space' ? t.public : t.private }}</Badge>
          </h1>
          <p v-if="unitLabel(set.unit)" class="text-muted-foreground text-sm">{{ unitLabel(set.unit) }}</p>
          <p v-if="set.description" class="text-sm whitespace-pre-line">{{ set.description }}</p>
        </div>
        <div v-if="owner" class="flex gap-1">
          <Button variant="outline" size="sm" :disabled="busy" @click="editOpen = true"><PencilIcon /> {{ t.edit }}</Button>
          <Button variant="ghost" size="icon" :disabled="busy" :aria-label="t.delete" @click="remove_"><Trash2Icon /></Button>
        </div>
      </div>

      <p class="text-muted-foreground text-sm">{{ t.solveSoon }}</p>

      <Card>
        <CardHeader class="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>{{ t.questions }} · {{ set.questionIds.length }}</CardTitle>
          <div v-if="canEdit" class="flex gap-1">
            <Button size="sm" :disabled="busy || full" @click="newOpen = true"><PlusIcon /> {{ t.addNew }}</Button>
            <Button size="sm" variant="outline" :disabled="busy || full" @click="openPick"><ListPlusIcon /> {{ t.addExisting }}</Button>
          </div>
        </CardHeader>
        <CardContent class="flex flex-col gap-2">
          <p v-if="!questions.length" class="text-muted-foreground text-sm">{{ t.empty }}</p>
          <ol class="flex flex-col gap-2">
            <li v-for="(q, i) in questions" :key="q.id" class="flex items-start gap-2 rounded-md border p-3">
              <span class="text-muted-foreground w-6 shrink-0 text-sm">{{ i + 1 }}.</span>
              <div class="flex min-w-0 flex-1 flex-col gap-1">
                <p class="text-sm whitespace-pre-line"><MathText :text="q.prompt" /></p>
                <div class="flex flex-wrap gap-1 text-xs">
                  <Badge variant="outline">{{ ko.tests.types[q.type] }}</Badge>
                  <Badge v-if="set.visibility === 'space' && q.sharing !== 'space'" variant="destructive" :title="t.privateQuestionHint">{{ t.privateQuestion }}</Badge>
                </div>
              </div>
              <Button v-if="canEdit" variant="ghost" size="icon" class="size-8" :disabled="busy" :aria-label="t.remove" @click="remove(q)"><XIcon /></Button>
            </li>
          </ol>
          <p v-if="hidden" class="text-muted-foreground text-xs">{{ t.hidden(hidden) }}</p>
        </CardContent>
      </Card>

      <ProblemSetFormDialog v-model:open="editOpen" :set="set" @saved="load" />
      <QuestionFormDialog v-model:open="newOpen" :preset="{ unit: set.unit, share: set.visibility === 'space' }" @saved="added" />
      <Dialog v-model:open="pickOpen">
        <DialogContent class="max-h-[90svh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{{ t.pickTitle }}</DialogTitle></DialogHeader>
          <Skeleton v-if="pickLoading" class="h-24 w-full" />
          <p v-else-if="!pickList.length" class="text-muted-foreground text-sm">{{ t.pickEmpty }}</p>
          <div v-else class="flex flex-col gap-1">
            <label v-for="q in pickList" :key="q.id" class="hover:bg-accent flex items-start gap-2 rounded-md p-2 text-sm">
              <input type="checkbox" class="mt-1" :aria-label="q.prompt" :checked="picked.includes(q.id)" @change="togglePick(q.id, ($event.target as HTMLInputElement).checked)">
              <MathText :text="q.prompt" />
            </label>
          </div>
          <DialogFooter>
            <Button :disabled="!picked.length || busy" @click="addPicked">{{ t.pickSubmit(picked.length) }}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </template>
  </div>
</template>
