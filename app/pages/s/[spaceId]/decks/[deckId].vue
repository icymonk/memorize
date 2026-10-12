<script setup lang="ts">
import type { Member } from '~/features/space/services/invites'
import type { Card } from '~/features/vocab/services/cards'
import type { Deck, DeckFolder } from '~/features/vocab/services/decks'
import { canDeleteContent, canEditContent } from '#shared/permissions'
import { ArrowDownIcon, ArrowLeftIcon, ArrowUpIcon, ClipboardPasteIcon, PencilIcon, PlusIcon, TableIcon, Trash2Icon, Undo2Icon, Volume2Icon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { listMembers } from '~/features/space/services/invites'
import CardFormDialog from '~/features/vocab/components/CardFormDialog.vue'
import DeckFormDialog from '~/features/vocab/components/DeckFormDialog.vue'
import PasteCardsDialog from '~/features/vocab/components/PasteCardsDialog.vue'
import { useSpeech } from '~/features/vocab/composables/useSpeech'
import { listCards, saveCards } from '~/features/vocab/services/cards'
import { deleteDeck, getDeck, listFolders } from '~/features/vocab/services/decks'
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
const cards = ref<Card[]>([])
const cardOpen = ref(false)
const editingCard = ref<Card | null>(null)
const pasteOpen = ref(false)
const tableMode = ref(false)
const draft = ref<{ id: string, front: string, back: string, removed: boolean }[]>([])
const saving = ref(false)
const speech = useSpeech()
const nextOrder = computed(() => cards.value.reduce((max, c) => Math.max(max, c.order + 1), 0))
const voiceSel = computed({
  get: () => (deck.value && speech.chosen.value[deck.value.langFrom]) ?? '',
  set: (v: string) => { if (deck.value) speech.setVoice(deck.value.langFrom, v) },
})

const canEdit = computed(() => !!deck.value && canEditContent(deck.value, uid.value))
const canDelete = computed(() => !!deck.value && space.current && canDeleteContent({ kind: space.current.kind, settings: space.current.settings, member: space.membership }, deck.value, uid.value))
const author = computed(() => members.value.find(m => m.uid === deck.value?.createdBy)?.displayName)
const folderName = computed(() => folders.value.find(f => f.id === deck.value?.folderId)?.name)

async function load() {
  loading.value = true
  try {
    const [d, f, m] = await Promise.all([getDeck($firestore, sid.value, deckId.value), listFolders($firestore, sid.value), listMembers($firestore, sid.value)])
    if (d) cards.value = await listCards($firestore, sid.value, d.id)
    deck.value = d
    folders.value = f
    members.value = m
    missing.value = !d
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

function startTable() {
  draft.value = cards.value.map(c => ({ id: c.id, front: c.front, back: c.back.join('; '), removed: false }))
  tableMode.value = true
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
  for (const [i, row] of draft.value.filter(r => !r.removed).entries()) {
    const card = byId.get(row.id)!
    const back = row.back.split(';').map(s => s.trim()).filter(Boolean)
    const front = row.front.trim()
    if (!front || !back.length) {
      toast.error(ko.errors.invalidInput)
      return
    }
    if (front !== card.front || back.join('\n') !== card.back.join('\n') || i !== card.order)
      changed.push({ ...card, front, back, order: i })
  }
  saving.value = true
  try {
    await saveCards($firestore, sid.value, deckId.value, changed, draft.value.filter(r => r.removed).map(r => r.id))
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
  if (!window.confirm(t.cards.deleteConfirm(card.front))) return
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
  if (!deck.value || !window.confirm(t.deleteConfirm(deck.value.title))) return
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
          </div>
        </div>
        <div class="flex gap-2">
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
            <template v-if="canEdit && !tableMode">
              <Button v-if="cards.length" variant="outline" size="sm" @click="startTable">
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

        <p v-if="!cards.length" class="text-muted-foreground rounded-xl border border-dashed py-10 text-center text-sm">
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
                    <Input v-model="row.front" :disabled="row.removed" maxlength="200" class="h-8" />
                  </td>
                  <td class="px-1 py-1">
                    <Input v-model="row.back" :disabled="row.removed" class="h-8" />
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
        </div>

        <ul v-else class="divide-y rounded-xl border">
          <li v-for="card in cards" :key="card.id" class="flex items-start gap-3 px-4 py-3">
            <div class="flex min-w-0 flex-1 flex-col gap-0.5">
              <div class="flex flex-wrap items-baseline gap-x-2">
                <span class="font-medium">{{ card.front }}</span>
                <span v-if="card.phonetic" class="text-muted-foreground text-sm">{{ card.phonetic }}</span>
                <span v-if="card.pos" class="text-muted-foreground text-xs">{{ card.pos }}</span>
              </div>
              <span class="text-sm">{{ card.back.join(', ') }}</span>
              <span v-if="card.examples[0]" class="text-muted-foreground truncate text-xs">{{ card.examples[0].text }}</span>
            </div>
            <div class="flex shrink-0">
              <Button v-if="speech.supported" variant="ghost" size="icon" class="size-8" :aria-label="t.cards.speak" @click="speech.speak(card.front, deck.langFrom)">
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

      <CardFormDialog v-model:open="cardOpen" :deck="deck" :card="editingCard" :next-order="nextOrder" :count="cards.length" @saved="reloadCards" />
      <PasteCardsDialog v-model:open="pasteOpen" :deck="deck" :next-order="nextOrder" :count="cards.length" @saved="reloadCards" />

      <DeckFormDialog v-model:open="editOpen" :deck="deck" :folders="folders" :members="members" @saved="load" />
    </template>
  </div>
</template>
