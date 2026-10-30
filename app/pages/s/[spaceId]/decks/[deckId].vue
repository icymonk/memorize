<script setup lang="ts">
import CardWord from '~/features/vocab/components/CardWord.vue'
import type { Member } from '~/features/space/services/invites'
import type { Card } from '~/features/vocab/services/cards'
import type { Deck, DeckFolder } from '~/features/vocab/services/decks'
import type { CardState, DeckProgress } from '~/features/vocab/services/srs'
import { canDeleteContent, canEditContent } from '#shared/permissions'
import { cardsToCsv, cardsToQuizlet } from '#shared/csv'
import { STUDY_MODES } from '#shared/study'
import { DownloadIcon } from '@lucide/vue'
import { ArrowDownIcon, ArrowLeftIcon, ArrowUpIcon, ClipboardCheckIcon, ClipboardPasteIcon, CopyIcon, PencilIcon, PlusIcon, StarIcon, TableIcon, Trash2Icon, Undo2Icon, Volume2Icon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { listMembers } from '~/features/space/services/invites'
import CardFormDialog from '~/features/vocab/components/CardFormDialog.vue'
import RelatedWords from '~/features/vocab/components/RelatedWords.vue'
import CopyDeckDialog from '~/features/vocab/components/CopyDeckDialog.vue'
import DeckFormDialog from '~/features/vocab/components/DeckFormDialog.vue'
import PasteCardsDialog from '~/features/vocab/components/PasteCardsDialog.vue'
import DeckQuestionsDialog from '~/features/tests/components/DeckQuestionsDialog.vue'
import { useSpeech } from '~/features/vocab/composables/useSpeech'
import { cardInput, MAX_CARDS_PER_DECK } from '#shared/schemas/card'
import { listCards, newCardId, saveCards } from '~/features/vocab/services/cards'
import { deleteDeck, getDeck, listFolders } from '~/features/vocab/services/decks'
import { listDeckStates, listMemberProgress, setStarred } from '~/features/vocab/services/srs'
import { errorMessage } from '~/lib/errors'
import { ko } from '~/locales/ko'

const t = ko.vocab
const space = useSpaceStore()
const auth = useAuthStore()
const route = useRoute()
const { $firestore } = useNuxtApp()

const sid = computed(() => space.current!.id)
const uid = computed(() => auth.user!.uid)
const deckId = computed(() => route.params.deckId as string)

const deck = ref<Deck | null>(null)
const folders = ref<DeckFolder[]>([])
const members = ref<Member[]>([])
const loading = ref(true)
const missing = ref(false)
const editOpen = ref(false)
const copyOpen = ref(false)
const cards = ref<Card[]>([])
const cardOpen = ref(false)
const editingCard = ref<Card | null>(null)
const pasteOpen = ref(false)
const testOpen = ref(false)
/** VOC-25 시험 기능이 켜져 있고 문제를 만들고 시험을 열 수 있을 때 */
const canTest = computed(() => !!space.current?.modules?.tests && (space.current.kind === 'personal' || (space.can('create') && space.can('host'))))
const tableMode = ref(false)
const draft = ref<{ id: string, front: string, reading: string, back: string, removed: boolean, isNew?: boolean }[]>([])
const saving = ref(false)
const speech = useSpeech()

/** VOC-12 내보내기: CSV(엑셀용 BOM)와 Quizlet 가져오기 형식(탭·줄바꿈) */
function exportCards(kind: 'csv' | 'quizlet') {
  const list = cards.value.map(c => ({ front: c.front, back: c.back, ...(c.reading ? { reading: c.reading } : {}) }))
  const body = kind === 'csv' ? `\uFEFF${cardsToCsv(list)}` : cardsToQuizlet(list)
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([body], { type: kind === 'csv' ? 'text/csv;charset=utf-8' : 'text/plain;charset=utf-8' }))
  a.download = `${deck.value!.title}.${kind === 'csv' ? 'csv' : 'txt'}`
  a.click()
  URL.revokeObjectURL(a.href)
}
const states = ref(new Map<string, CardState>())
const memberProgress = ref<DeckProgress[]>([])
const mastered = computed(() => cards.value.filter(c => states.value.get(c.id)?.status === 'mastered').length)
const learning = computed(() => cards.value.filter(c => ['learning', 'review'].includes(states.value.get(c.id)?.status ?? '')).length)
const hasStarred = computed(() => cards.value.some(c => states.value.get(c.id)?.starred))
const showMembers = computed(() => space.current?.kind === 'workspace' && space.current.settings?.progressSharing === 'everyone')
const nextOrder = computed(() => cards.value.reduce((max, c) => Math.max(max, c.order + 1), 0))
const voiceSel = computed({
  get: () => (deck.value && speech.chosen.value[deck.value.langFrom]) ?? '',
  set: (v: string) => { if (deck.value) speech.setVoice(deck.value.langFrom, v) },
})

const canEdit = computed(() => !!deck.value && canEditContent(deck.value, uid.value))
const canDelete = computed(() => !!deck.value && space.current && canDeleteContent({ kind: space.current.kind, settings: space.current.settings, member: space.membership }, deck.value, uid.value))
const author = computed(() => members.value.find(m => m.uid === deck.value?.createdBy)?.displayName)
const folderName = computed(() => folders.value.find(f => f.id === deck.value?.folderId)?.name)

/** VOC-40·41·45 내 카드별 상태, 멤버 진도 */
async function loadProgress() {
  const [mine, others] = await Promise.all([
    listDeckStates($firestore, sid.value, uid.value, deckId.value).catch(() => [] as CardState[]),
    showMembers.value ? listMemberProgress($firestore, sid.value, deckId.value, members.value.map(m => m.uid)) : Promise.resolve([]),
  ])
  states.value = new Map(mine.map(s => [s.cardId, s]))
  memberProgress.value = others.filter(p => p.masteredCount + p.learningCount > 0).sort((a, b) => b.masteredCount - a.masteredCount)
}

async function toggleStar(card: Card) {
  const existing = states.value.get(card.id)
  const starred = !existing?.starred
  try {
    await setStarred($firestore, sid.value, uid.value, deckId.value, card, existing, starred)
    await loadProgress()
  }
  catch {
    toast.error(t.progress.starFailed)
  }
}

async function load() {
  loading.value = true
  try {
    const [d, f, m] = await Promise.all([getDeck($firestore, sid.value, deckId.value), listFolders($firestore, sid.value), listMembers($firestore, sid.value)])
    if (d) cards.value = await listCards($firestore, sid.value, d.id)
    deck.value = d
    folders.value = f
    members.value = m
    missing.value = !d
    if (d) await loadProgress()
  }
  catch {
    missing.value = true
  }
  finally {
    loading.value = false
  }
}
onMounted(load)
watch(deckId, load)

async function reloadCards() {
  cards.value = await listCards($firestore, sid.value, deckId.value)
}

function openCard(card: Card | null) {
  editingCard.value = card
  cardOpen.value = true
}

/** 일본어 단어장이거나 읽는 법이 있는 카드가 있으면 표에 읽는 법 칸을 보여 준다 */
const showReading = computed(() => deck.value?.langFrom === 'ja' || cards.value.some(c => c.reading))

function startTable() {
  draft.value = cards.value.map(c => ({ id: c.id, front: c.front, reading: c.reading ?? '', back: c.back.join('; '), removed: false }))
  tableMode.value = true
}

/** 표에서 바로 새 단어를 넣는다 */
function addRow() {
  draft.value = [...draft.value, { id: newCardId($firestore, sid.value, deckId.value), front: '', reading: '', back: '', removed: false, isNew: true }]
  nextTick(() => document.querySelector<HTMLInputElement>(`#row-front-${draft.value.length - 1}`)?.focus())
}

function move(i: number, d: number) {
  const j = i + d
  if (j < 0 || j >= draft.value.length) return
  const rows = [...draft.value]
  ;[rows[i], rows[j]] = [rows[j]!, rows[i]!]
  draft.value = rows
}

/** VOC-13: 표 편집 결과 중 바뀐 카드만 저장, 순서는 표 순서대로 다시 매긴다 */
async function saveTable() {
  const byId = new Map(cards.value.map(c => [c.id, c]))
  const changed: Card[] = []
  const rows = draft.value.filter(r => !r.removed && !(r.isNew && !r.front.trim() && !r.back.trim()))
  if (cards.value.length + rows.filter(r => r.isNew).length > MAX_CARDS_PER_DECK) {
    toast.error(t.cards.tooMany(MAX_CARDS_PER_DECK))
    return
  }
  for (const [i, row] of rows.entries()) {
    const back = row.back.split(';').map(s => s.trim()).filter(Boolean)
    const front = row.front.trim()
    const reading = row.reading.trim()
    if (!front || !back.length) {
      toast.error(ko.errors.invalidInput)
      return
    }
    if (row.isNew) {
      const input = cardInput.safeParse({ front, back, ...(reading ? { reading } : {}), ...(deck.value?.fields.includes('audio') ? { audio: { tts: true } } : {}) })
      if (!input.success) {
        toast.error(ko.errors.invalidInput)
        return
      }
      changed.push({ ...input.data, id: row.id, order: i, contentRev: 0 })
      continue
    }
    const card = byId.get(row.id)!
    if (front !== card.front || reading !== (card.reading ?? '') || back.join('\n') !== card.back.join('\n') || i !== card.order) {
      const { reading: _old, ...rest } = card
      changed.push({ ...rest, front, back, order: i, ...(reading ? { reading } : {}) })
    }
  }
  saving.value = true
  try {
    await saveCards($firestore, sid.value, deckId.value, changed, draft.value.filter(r => r.removed && !r.isNew).map(r => r.id))
    toast.success(t.cards.saved)
    tableMode.value = false
    await reloadCards()
  }
  catch (error) {
    toast.error(errorMessage(error) ?? ko.errors.unknown)
  }
  finally {
    saving.value = false
  }
}

async function removeCard(card: Card) {
  if (!(await confirmDialog(t.cards.deleteConfirm(card.front)))) return
  try {
    await saveCards($firestore, sid.value, deckId.value, [], [card.id])
    toast.success(t.cards.deleted)
    await reloadCards()
  }
  catch (error) {
    toast.error(errorMessage(error) ?? ko.errors.unknown)
  }
}

async function remove() {
  if (!deck.value || !(await confirmDialog(t.deleteConfirm(deck.value.title)))) return
  try {
    await deleteDeck($firestore, sid.value, deck.value.id)
    toast.success(t.deleted)
    await navigateTo(`/s/${sid.value}/decks`)
  }
  catch (error) {
    toast.error(errorMessage(error) ?? ko.errors.unknown)
  }
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-3xl flex-col gap-6">
    <NuxtLink :to="`/s/${sid}/decks`" class="text-muted-foreground flex items-center gap-1 text-sm hover:underline">
      <ArrowLeftIcon class="size-4" />{{ t.title }}
    </NuxtLink>

    <Skeleton v-if="loading" class="h-40 rounded-xl" />
    <p v-else-if="missing || !deck" class="text-muted-foreground py-10 text-center text-sm">
      {{ ko.errors.notFound }}
    </p>
    <template v-else>
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex flex-col gap-1">
          <h1 class="text-2xl font-semibold">
            {{ deck.title }}
          </h1>
          <div class="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-sm">
            <span>{{ t.langs[deck.langFrom] }} → {{ t.langs[deck.langTo] }}</span>
            <span>{{ t.cardCount(cards.length) }}</span>
            <span v-if="space.current?.kind === 'workspace'">{{ t.learnerCount(deck.learnerCount) }}</span>
            <span v-if="space.current?.kind === 'workspace' && author">{{ t.by(author) }}</span>
            <span v-if="folderName">{{ folderName }}</span>
            <span v-if="deck.copiedFrom">{{ t.copy.from(deck.copiedFrom.spaceName ?? '') }}</span>
          </div>
        </div>
        <div class="flex gap-2">
          <Button variant="outline" size="sm" @click="copyOpen = true">
            <CopyIcon />{{ t.copy.button }}
          </Button>
          <Button v-if="canEdit" variant="outline" size="sm" @click="editOpen = true">
            <PencilIcon />{{ t.edit }}
          </Button>
          <Button v-if="canDelete" variant="outline" size="sm" class="text-destructive" @click="remove">
            <Trash2Icon />{{ t.delete }}
          </Button>
        </div>
      </div>

      <p v-if="deck.description" class="whitespace-pre-line">
        {{ deck.description }}
      </p>
      <div class="flex flex-wrap gap-1.5">
        <Badge v-if="space.current?.kind === 'workspace'" variant="secondary">
          {{ t.fields.visibility }}: {{ t.visibility[deck.visibility] }}
        </Badge>
        <Badge v-if="space.current?.kind === 'workspace'" variant="secondary">
          {{ t.fields.editPolicy }}: {{ t.editPolicy[deck.editPolicy] }}
        </Badge>
        <Badge v-for="tag in deck.tags" :key="tag" variant="outline">
          #{{ tag }}
        </Badge>
      </div>

      <section v-if="cards.length && (states.size || memberProgress.length)" class="grid gap-3 sm:grid-cols-2">
        <div class="flex flex-col gap-2 rounded-xl border p-4">
          <span class="text-sm font-medium">{{ t.progress.mine }}</span>
          <div class="bg-muted h-2 overflow-hidden rounded-full">
            <div class="bg-primary h-full" :style="{ width: `${mastered / cards.length * 100}%` }" />
          </div>
          <span class="text-muted-foreground text-xs">{{ t.progress.percent(mastered, cards.length) }} · {{ t.progress.learning(learning) }}</span>
        </div>
        <div v-if="showMembers" class="flex flex-col gap-2 rounded-xl border p-4">
          <span class="text-sm font-medium">{{ t.progress.members }}</span>
          <p v-if="!memberProgress.length" class="text-muted-foreground text-xs">
            {{ t.progress.membersEmpty }}
          </p>
          <ul v-else class="flex flex-col gap-1.5">
            <li v-for="p in memberProgress.slice(0, 10)" :key="p.uid" class="flex items-center gap-2 text-xs">
              <span class="w-24 truncate">{{ members.find(m => m.uid === p.uid)?.displayName ?? '—' }}</span>
              <div class="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
                <div class="bg-primary h-full" :style="{ width: `${Math.min(100, p.masteredCount / cards.length * 100)}%` }" />
              </div>
              <span class="text-muted-foreground w-10 text-right tabular-nums">{{ Math.round(Math.min(100, p.masteredCount / cards.length * 100)) }}%</span>
            </li>
          </ul>
        </div>
      </section>

      <nav v-if="cards.length" class="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Button v-for="m in STUDY_MODES.filter(x => x !== 'dictation' || speech.supported)" :key="m" variant="outline" class="h-12" as-child>
          <NuxtLink :to="`/s/${sid}/study/${deckId}?mode=${m}`">
            {{ t.study.modes[m] }}
          </NuxtLink>
        </Button>
        <Button v-if="hasStarred" variant="outline" class="h-12" as-child>
          <NuxtLink :to="`/s/${sid}/study/${deckId}?mode=flashcards&starred=1`">
            <StarIcon class="fill-amber-400 text-amber-400" />{{ t.progress.starredOnly }}
          </NuxtLink>
        </Button>
        <Button v-if="canTest" variant="outline" class="h-12" @click="testOpen = true">
          <ClipboardCheckIcon />{{ ko.tests.gen.testOpen }}
        </Button>
      </nav>
      <DeckQuestionsDialog v-if="canTest" v-model:open="testOpen" :test-deck-id="deckId" />

      <section class="flex flex-col gap-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-lg font-semibold">
            {{ t.cards.title }}
          </h2>
          <div class="flex flex-wrap items-center gap-2">
            <select
              v-if="speech.supported && speech.voicesFor(deck.langFrom).length"
              v-model="voiceSel"
              :aria-label="t.cards.voice"
              class="border-input bg-background h-8 max-w-48 rounded-md border px-2 text-sm"
            >
              <option value="">
                {{ t.cards.defaultVoice }}
              </option>
              <option v-for="v in speech.voicesFor(deck.langFrom)" :key="v.name" :value="v.name">
                {{ v.name }}
              </option>
            </select>
            <template v-if="!tableMode && cards.length">
              <Button variant="outline" size="sm" @click="exportCards('csv')">
                <DownloadIcon />{{ t.cards.exportCsv }}
              </Button>
              <Button variant="outline" size="sm" @click="exportCards('quizlet')">
                <DownloadIcon />{{ t.cards.exportQuizlet }}
              </Button>
            </template>
            <template v-if="canEdit && !tableMode">
              <Button variant="outline" size="sm" @click="startTable">
                <TableIcon />{{ t.cards.tableEdit }}
              </Button>
              <Button variant="outline" size="sm" @click="pasteOpen = true">
                <ClipboardPasteIcon />{{ t.cards.paste }}
              </Button>
              <Button size="sm" @click="openCard(null)">
                <PlusIcon />{{ t.cards.add }}
              </Button>
            </template>
            <template v-if="tableMode">
              <Button variant="outline" size="sm" @click="tableMode = false">
                {{ t.cancel }}
              </Button>
              <Button size="sm" :disabled="saving" @click="saveTable">
                {{ t.cards.tableSave }}
              </Button>
            </template>
          </div>
        </div>

        <p v-if="!cards.length && !tableMode" class="text-muted-foreground rounded-xl border border-dashed py-10 text-center text-sm">
          {{ t.cards.empty }}
        </p>

        <div v-else-if="tableMode" class="flex flex-col gap-2">
          <p class="text-muted-foreground text-xs">
            {{ t.cards.tableBackHint }}
          </p>
          <div class="overflow-x-auto rounded-xl border">
            <table class="w-full text-sm">
              <thead class="text-muted-foreground border-b text-left text-xs">
                <tr>
                  <th class="w-10 px-2 py-2" />
                  <th class="px-2 py-2">
                    {{ t.cards.front }}
                  </th>
                  <th v-if="showReading" class="px-2 py-2">
                    {{ ko.vocab.cardFields.reading }}
                  </th>
                  <th class="px-2 py-2">
                    {{ t.cards.back }}
                  </th>
                  <th class="w-28 px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, i) in draft" :key="row.id" class="border-b last:border-0" :class="row.removed && 'opacity-40'">
                  <td class="text-muted-foreground px-2 text-right tabular-nums">
                    {{ i + 1 }}
                  </td>
                  <td class="px-1 py-1">
                    <Input :id="`row-front-${i}`" v-model="row.front" :disabled="row.removed" maxlength="200" class="h-8" />
                  </td>
                  <td v-if="showReading" class="px-1 py-1">
                    <Input v-model="row.reading" :disabled="row.removed" maxlength="100" lang="ja" class="h-8" :aria-label="ko.vocab.cardFields.reading" />
                  </td>
                  <td class="px-1 py-1">
                    <Input v-model="row.back" :disabled="row.removed" class="h-8" @keydown.enter.prevent="i === draft.length - 1 && addRow()" />
                  </td>
                  <td class="px-1 py-1">
                    <div class="flex justify-end">
                      <Button variant="ghost" size="icon" class="size-8" :aria-label="t.cards.moveUp" :disabled="i === 0" @click="move(i, -1)">
                        <ArrowUpIcon />
                      </Button>
                      <Button variant="ghost" size="icon" class="size-8" :aria-label="t.cards.moveDown" :disabled="i === draft.length - 1" @click="move(i, 1)">
                        <ArrowDownIcon />
                      </Button>
                      <Button variant="ghost" size="icon" class="size-8" :aria-label="row.removed ? t.cards.undoRemove : t.cards.remove" @click="row.removed = !row.removed">
                        <Undo2Icon v-if="row.removed" />
                        <Trash2Icon v-else />
                      </Button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <Button variant="outline" size="sm" class="self-start" @click="addRow">
            <PlusIcon />{{ t.cards.addRow }}
          </Button>
        </div>

        <ul v-else class="divide-y rounded-xl border">
          <li v-for="card in cards" :key="card.id" class="flex items-start gap-3 px-4 py-3">
            <div class="flex min-w-0 flex-1 flex-col gap-0.5">
              <div class="flex flex-wrap items-baseline gap-x-2">
                <span class="font-medium"><CardWord :front="card.front" :reading="card.reading" /></span>
                <span v-if="card.phonetic" class="text-muted-foreground text-sm">{{ card.phonetic }}</span>
                <span v-if="card.pos" class="text-muted-foreground text-xs">{{ card.pos }}</span>
              </div>
              <span class="text-sm">{{ card.back.join(', ') }}</span>
              <span v-if="card.examples[0]" class="text-muted-foreground truncate text-xs">{{ card.examples[0].text }}</span>
              <RelatedWords :card="card" :cards="cards" class="text-xs" />
              <span v-if="states.get(card.id) && states.get(card.id)!.reps + states.get(card.id)!.wrong > 0" class="text-muted-foreground flex flex-wrap gap-x-2 text-xs">
                <Badge variant="secondary" class="px-1.5 py-0 text-[10px]">{{ t.progress.status[states.get(card.id)!.status] }}</Badge>
                <span>{{ t.progress.counts(states.get(card.id)!.correct, states.get(card.id)!.wrong) }}</span>
                <span>{{ t.progress.nextReview(new Date(states.get(card.id)!.due).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })) }}</span>
              </span>
            </div>
            <div class="flex shrink-0">
              <Button variant="ghost" size="icon" class="size-8" :aria-label="states.get(card.id)?.starred ? t.progress.unstar : t.progress.star" :aria-pressed="!!states.get(card.id)?.starred" @click="toggleStar(card)">
                <StarIcon :class="states.get(card.id)?.starred ? 'fill-amber-400 text-amber-400' : ''" />
              </Button>
              <Button v-if="speech.supported" variant="ghost" size="icon" class="size-8" :aria-label="t.cards.speak" @click="speech.speak(card.reading || card.front, deck.langFrom)">
                <Volume2Icon />
              </Button>
              <template v-if="canEdit">
                <Button variant="ghost" size="icon" class="size-8" :aria-label="t.cards.edit" @click="openCard(card)">
                  <PencilIcon />
                </Button>
                <Button variant="ghost" size="icon" class="size-8" :aria-label="t.cards.remove" @click="removeCard(card)">
                  <Trash2Icon />
                </Button>
              </template>
            </div>
          </li>
        </ul>
      </section>

      <CopyDeckDialog v-model:open="copyOpen" :from-space-id="sid" :content-id="deckId" />
      <CardFormDialog v-model:open="cardOpen" :deck="deck" :card="editingCard" :next-order="nextOrder" :count="cards.length" :cards="cards" @saved="reloadCards" />
      <PasteCardsDialog v-model:open="pasteOpen" :deck="deck" :next-order="nextOrder" :count="cards.length" :cards="cards" @saved="reloadCards" />

      <DeckFormDialog v-model:open="editOpen" :deck="deck" :folders="folders" :members="members" @saved="load" />
    </template>
  </div>
</template>
