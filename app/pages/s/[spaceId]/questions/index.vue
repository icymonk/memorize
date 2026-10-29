<script setup lang="ts">
import type { Member } from '~/features/space/services/invites'
import type { Question, QuestionKey } from '~/features/tests/services/questions'
import { CopyIcon, LayersIcon, PencilIcon, PlusIcon, Trash2Icon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import AttachmentList from '~/features/files/components/AttachmentList.vue'
import { listMembers } from '~/features/space/services/invites'
import MathText from '~/features/math/components/MathText.vue'
import DeckQuestionsDialog from '~/features/tests/components/DeckQuestionsDialog.vue'
import QuestionFormDialog from '~/features/tests/components/QuestionFormDialog.vue'
import { deleteQuestion, getQuestionKey, listQuestions } from '~/features/tests/services/questions'
import CopyDeckDialog from '~/features/vocab/components/CopyDeckDialog.vue'
import { errorMessage } from '~/lib/errors'
import { ko } from '~/locales/ko'

/** TST-04 문제 은행: 내 문제 / 공유된 문제 */
const t = ko.tests
const space = useSpaceStore()
const auth = useAuthStore()
const { $firestore } = useNuxtApp()

if (!space.current?.modules?.tests) {
  await navigateTo(`/s/${space.current!.id}`, { replace: true })
}

const sid = computed(() => space.current!.id)
const uid = computed(() => auth.user!.uid)
const personal = computed(() => space.current?.kind === 'personal')
const canCreate = computed(() => space.can('create'))

const lists = ref<{ mine: Question[], shared: Question[] }>({ mine: [], shared: [] })
const members = ref<Member[]>([])
const loading = ref(true)
const loadError = ref(false)
const tab = ref<'mine' | 'shared'>('mine')
const tagFilter = ref('')
const subjectFilter = ref('')
const subjects = computed(() => space.current?.subjects ?? [])
const subjectName = computed(() => new Map(subjects.value.map(s => [s.id, s.name])))
const copyOpen = ref(false)
const copyId = ref('')
const formOpen = ref(false)
const genOpen = ref(false)
const vocabOn = computed(() => space.current?.modules?.vocab !== false)
const editing = ref<Question | null>(null)
const openId = ref<string | null>(null)
const keys = ref<Record<string, QuestionKey | null>>({})

const names = computed(() => new Map(members.value.map(m => [m.uid, m.displayName])))
const shown = computed(() => {
  const l = lists.value[tab.value]
  return l.filter(q => (!tagFilter.value || q.tags.includes(tagFilter.value)) && (!subjectFilter.value || q.subjectId === subjectFilter.value))
})
const tags = computed(() => [...new Set(lists.value[tab.value].flatMap(q => q.tags))].sort())

async function load() {
  loading.value = true
  loadError.value = false
  try {
    const [q, m] = await Promise.all([listQuestions($firestore, sid.value, uid.value), personal.value ? [] : listMembers($firestore, sid.value)])
    lists.value = q
    members.value = m
    keys.value = {}
  }
  catch {
    loadError.value = true
  }
  finally {
    loading.value = false
  }
}
onMounted(load)

async function toggle(q: Question) {
  openId.value = openId.value === q.id ? null : q.id
  if (openId.value && !(q.id in keys.value)) keys.value = { ...keys.value, [q.id]: await getQuestionKey($firestore, sid.value, q.id) }
}

function answerText(q: Question, k: QuestionKey) {
  if (q.type === 'single' || q.type === 'multi') return k.answer.map(i => `${Number(i) + 1}. ${q.choices[Number(i)] ?? ''}`).join(', ')
  if (q.type === 'ox') return k.answer[0] ? 'O' : 'X'
  return k.answer.join(', ')
}

function copy(q: Question) {
  copyId.value = q.id
  copyOpen.value = true
}

function create() {
  editing.value = null
  formOpen.value = true
}
function edit(q: Question) {
  editing.value = q
  formOpen.value = true
}
async function remove(q: Question) {
  if (!(await confirmDialog(t.deleteConfirm))) return
  try {
    await deleteQuestion($firestore, sid.value, q)
    toast.success(t.deleted)
    await load()
  }
  catch (e) {
    toast.error(errorMessage(e) ?? ko.errors.unknown)
  }
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 md:p-6">
    <div class="flex items-center justify-between gap-2">
      <h1 class="text-xl font-semibold">{{ t.title }}</h1>
      <div v-if="canCreate" class="flex gap-2">
        <Button v-if="vocabOn" size="sm" variant="outline" @click="genOpen = true">
          <LayersIcon /> {{ t.gen.open }}
        </Button>
        <Button size="sm" @click="create">
          <PlusIcon /> {{ t.create }}
        </Button>
      </div>
    </div>
    <Tabs v-if="!personal" v-model="tab">
      <TabsList>
        <TabsTrigger v-for="k in (['mine', 'shared'] as const)" :key="k" :value="k">{{ t.tabs[k] }}</TabsTrigger>
      </TabsList>
    </Tabs>
    <div v-if="subjects.length" class="flex flex-wrap gap-1">
      <Button size="sm" class="h-7" :variant="!subjectFilter ? 'default' : 'outline'" @click="subjectFilter = ''">{{ t.allSubjects }}</Button>
      <Button v-for="s in subjects" :key="s.id" size="sm" class="h-7" :variant="subjectFilter === s.id ? 'default' : 'outline'" @click="subjectFilter = s.id">{{ s.name }}</Button>
    </div>
    <div v-if="tags.length" class="flex flex-wrap gap-1">
      <Button v-for="tg in tags" :key="tg" size="sm" class="h-7" :variant="tagFilter === tg ? 'default' : 'outline'" @click="tagFilter = tagFilter === tg ? '' : tg">
        #{{ tg }}
      </Button>
    </div>
    <Skeleton v-if="loading" class="h-24" />
    <p v-else-if="loadError" class="text-destructive text-sm">{{ t.loadFailed }}</p>
    <p v-else-if="!shown.length" class="text-muted-foreground py-10 text-center text-sm">{{ t.empty[tab] }}</p>
    <ul v-else class="divide-y rounded-lg border">
      <li v-for="q in shown" :key="q.id" class="flex flex-col gap-2 px-4 py-3">
        <div class="flex items-start gap-3">
          <button type="button" class="flex min-w-0 flex-1 flex-col items-start gap-1 text-left" @click="toggle(q)">
            <span class="line-clamp-2 text-sm whitespace-pre-line"><MathText :text="q.prompt" /></span>
            <span class="text-muted-foreground flex flex-wrap gap-x-2 text-xs">
              <span>{{ t.types[q.type] }}</span>
              <span v-if="q.subjectId && subjectName.get(q.subjectId)">{{ subjectName.get(q.subjectId) }}</span>
              <span v-if="q.copiedFrom">{{ t.copiedFrom(q.copiedFrom.spaceName) }}</span>
              <span>{{ t.difficulty[q.difficulty] }}</span>
              <span>{{ t.points(q.defaultPoints) }}</span>
              <span v-if="q.sharing === 'space' && tab === 'mine'">{{ t.sharedBadge }}</span>
              <span v-if="tab === 'shared'">{{ t.by(names.get(q.createdBy) ?? '') }}</span>
              <span v-for="tg in q.tags" :key="tg">#{{ tg }}</span>
            </span>
          </button>
          <Button v-if="space.spaces.length > 1" variant="ghost" size="icon" class="size-8" :aria-label="t.copy" :title="t.copy" @click="copy(q)">
            <CopyIcon />
          </Button>
          <template v-if="q.createdBy === uid">
            <Button variant="ghost" size="icon" class="size-8" :aria-label="t.edit" @click="edit(q)">
              <PencilIcon />
            </Button>
            <Button variant="ghost" size="icon" class="size-8" :aria-label="ko.dialog.cancel" @click="remove(q)">
              <Trash2Icon />
            </Button>
          </template>
        </div>
        <div v-if="openId === q.id" class="bg-muted/50 flex flex-col gap-1 rounded-md p-3 text-sm">
          <AttachmentList v-if="q.media?.length" :files="q.media" />
          <ol v-if="q.choices.length" class="list-decimal pl-5">
            <li v-for="(c, i) in q.choices" :key="i"><MathText :text="c" /></li>
          </ol>
          <template v-if="keys[q.id]">
            <p v-if="q.type !== 'essay'"><span class="font-medium">{{ t.answer }}:</span> <MathText :text="answerText(q, keys[q.id]!)" /></p>
            <p v-if="keys[q.id]!.rubric" class="whitespace-pre-line"><span class="font-medium">{{ t.fields.rubric }}:</span> {{ keys[q.id]!.rubric }}</p>
            <p v-if="keys[q.id]!.explanation" class="whitespace-pre-line"><span class="font-medium">{{ t.fields.explanation }}:</span> <MathText :text="keys[q.id]!.explanation" /></p>
          </template>
          <p v-else-if="q.id in keys" class="text-muted-foreground text-xs">{{ t.answerHidden }}</p>
        </div>
      </li>
    </ul>
    <QuestionFormDialog v-model:open="formOpen" :question="editing" @saved="load" />
    <DeckQuestionsDialog v-model:open="genOpen" @saved="tab = 'mine'; load()" />
    <CopyDeckDialog v-model:open="copyOpen" kind="question" :from-space-id="sid" :content-id="copyId" />
  </div>
</template>
