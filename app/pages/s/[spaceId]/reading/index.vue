<script setup lang="ts">
import type { ShelfStatus } from '#shared/schemas/book'
import type { BookGroup, ShelfItem } from '~/features/reading/services/shelf'
import type { Member } from '~/features/space/services/invites'
import { logUnit, positionKey, SHELF_STATUS } from '#shared/schemas/book'
import { LayoutGridIcon, ListIcon, PencilLineIcon, PlusIcon, Trash2Icon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { dateKey } from '#shared/dates'
import { recommendBooks } from '#shared/reading'
import AddBookDialog from '~/features/reading/components/AddBookDialog.vue'
import BookDetailDialog from '~/features/reading/components/BookDetailDialog.vue'
import NewReviewDialog from '~/features/notes/components/NewReviewDialog.vue'
import QuoteList from '~/features/reading/components/QuoteList.vue'
import ReadingStats from '~/features/reading/components/ReadingStats.vue'
import { askFinish, deleteRefs, myBookData, recordReading } from '~/features/reading/services/logs'
import type { Quote } from '~/features/reading/services/quotes'
import { listQuotes } from '~/features/reading/services/quotes'
import { joinBook, listBooks, listMyShelf, removeFromShelf, statusPatch, updateShelf } from '~/features/reading/services/shelf'
import { listMembers } from '~/features/space/services/invites'
import { errorMessage } from '~/lib/errors'
import { ko } from '~/locales/ko'

/** READ-01~03·05·10·12·13: 내 책장(상태별)과 워크스페이스 책장 */
const t = ko.reading
const space = useSpaceStore()
const auth = useAuthStore()
const { $firestore } = useNuxtApp()

if (!space.current?.modules?.reading) {
  await navigateTo(`/s/${space.current!.id}`, { replace: true })
}

const sid = computed(() => space.current!.id)
const workspace = computed(() => space.current?.kind === 'workspace')
const mine = ref<ShelfItem[]>([])
const recSections = computed(() => {
  const r = recommendBooks(books.value, mine.value)
  return (['popular', 'topRated', 'similar'] as const).map(key => ({ key, items: r[key] })).filter(x => x.items.length)
})
const books = ref<BookGroup[]>([])
const members = ref<Member[]>([])
const loading = ref(true)
const tab = ref<'all' | ShelfStatus | 'space' | 'quotes' | 'stats'>('all')
const quotes = ref<Quote[] | null>(null)
// READ-12 표지 격자 / 리스트 (기기에 저장)
const VIEW_KEY = 'memorize:shelfView'
const view = ref<'grid' | 'list'>(localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid')
watch(view, v => localStorage.setItem(VIEW_KEY, v))
const quoteMember = ref('')
const quoteGroups = computed(() => {
  const groups = new Map<string, { title: string, items: Quote[] }>()
  for (const q of quotes.value ?? []) {
    if (quoteMember.value && q.uid !== quoteMember.value) continue
    const g = groups.get(q.bookKey) ?? { title: q.title, items: [] }
    g.items.push(q)
    groups.set(q.bookKey, g)
  }
  return [...groups.values()]
})
const addOpen = ref(false)
const detail = ref<ShelfItem | null>(null)
const detailOpen = ref(false)
const reviewBook = ref<ShelfItem | null>(null)
const reviewOpen = ref(false)
const today = dateKey(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone)
const mineKeys = computed(() => new Set(mine.value.map(b => b.bookKey)))

const shown = computed(() => (tab.value === 'all' ? mine.value : mine.value.filter(b => b.status === tab.value))
  .slice().sort((a, b) => (b.updatedAt?.toMillis() ?? 0) - (a.updatedAt?.toMillis() ?? 0)))
const name = (uid: string) => members.value.find(m => m.uid === uid)?.displayName ?? t.someone

async function load() {
  loading.value = true
  try {
    const [m, b, mb] = await Promise.all([
      listMyShelf($firestore, sid.value, auth.user!.uid),
      workspace.value ? listBooks($firestore, sid.value) : Promise.resolve([]),
      workspace.value ? listMembers($firestore, sid.value) : Promise.resolve([]),
    ])
    mine.value = m
    books.value = b.sort((x, y) => y.readerUids.length - x.readerUids.length)
    members.value = mb
  }
  catch (e) {
    toast.error(errorMessage(e) ?? ko.errors.unknown)
  }
  finally {
    loading.value = false
  }
}
onMounted(load)
watch(sid, () => {
  quotes.value = null
  load()
})

/** READ-31: 구절 모아 보기 — 책별, 멤버별 */
watch(tab, async (v) => {
  if (v !== 'quotes') return
  try {
    quotes.value = await listQuotes($firestore, sid.value, auth.user!.uid, workspace.value)
  }
  catch (e) {
    quotes.value = []
    toast.error(errorMessage(e) ?? ko.errors.unknown)
  }
})

async function changeStatus(b: ShelfItem, status: ShelfStatus) {
  const patch = statusPatch(b, status, today)
  await updateShelf($firestore, sid.value, b.id, patch)
  Object.assign(b, patch)
}

function openDetail(b: ShelfItem) {
  detail.value = b
  detailOpen.value = true
}

/** READ-21: 빠른 기록 */
async function quickLog(b: ShelfItem) {
  const unit = logUnit(b.format)
  const cur = b.position?.[positionKey(unit)] ?? null
  const v = await promptDialog(t.log.quickPrompt(t.log.units[unit] ?? ''), cur != null ? String(cur) : '')
  if (v == null) return
  const to = Number.parseInt(v, 10)
  if (!Number.isFinite(to) || to < 0) {
    toast.error(t.invalid)
    return
  }
  const input = { bookKey: b.bookKey, date: today, unit, from: cur, to, minutes: 0, memo: '' }
  try {
    Object.assign(b, await recordReading($firestore, sid.value, auth.user!.uid, b, input))
    toast.success(t.log.saved)
    const done = await askFinish($firestore, sid.value, b, input, t.log.finishAsk)
    if (done) {
      Object.assign(b, done)
      toast.success(t.log.finished)
    }
  }
  catch (e) {
    toast.error(errorMessage(e) ?? ko.errors.unknown)
  }
}

async function join(g: BookGroup) {
  try {
    await joinBook($firestore, sid.value, auth.user!.uid, g)
    toast.success(t.joined)
    await load()
  }
  catch (e) {
    toast.error(errorMessage(e) ?? ko.errors.unknown)
  }
}

async function remove(b: ShelfItem) {
  if (!await confirmDialog(t.removeConfirm(b.title))) return
  try {
    const refs = await myBookData($firestore, sid.value, auth.user!.uid, b.bookKey)
    if (refs.length && await confirmDialog(t.removeData(refs.length))) await deleteRefs($firestore, refs)
    await removeFromShelf($firestore, sid.value, b.id)
    mine.value = mine.value.filter(x => x.id !== b.id)
  }
  catch (e) {
    toast.error(errorMessage(e) ?? ko.errors.unknown)
  }
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h1 class="text-2xl font-semibold">
        {{ t.title }}
      </h1>
      <Button @click="addOpen = true">
        <PlusIcon />
        {{ t.add }}
      </Button>
    </div>

    <Tabs v-model="tab">
      <TabsList class="flex-wrap">
        <TabsTrigger value="all">
          {{ t.all }} <span class="text-muted-foreground ml-1 text-xs">{{ mine.length }}</span>
        </TabsTrigger>
        <TabsTrigger v-for="s in SHELF_STATUS" :key="s" :value="s">
          {{ t.statuses[s] }} <span class="text-muted-foreground ml-1 text-xs">{{ mine.filter(b => b.status === s).length }}</span>
        </TabsTrigger>
        <TabsTrigger v-if="workspace" value="space">
          {{ t.spaceShelf }}
        </TabsTrigger>
        <TabsTrigger value="quotes">
          {{ t.quotes.tab }}
        </TabsTrigger>
        <TabsTrigger value="stats">
          {{ t.stats.tab }}
        </TabsTrigger>
      </TabsList>
    </Tabs>
    <div v-if="!['space', 'quotes', 'stats'].includes(tab)" class="-mt-2 flex justify-end gap-1">
      <Button v-for="[v, icon] in ([['grid', LayoutGridIcon], ['list', ListIcon]] as const)" :key="v" variant="ghost" size="icon" class="size-8" :class="view === v && 'bg-muted'" :aria-label="t.view[v]" :title="t.view[v]" :aria-pressed="view === v" @click="view = v">
        <component :is="icon" />
      </Button>
    </div>

    <ReadingStats v-if="tab === 'stats'" :sid="sid" />
    <template v-else-if="tab === 'quotes'">
      <p v-if="!quotes" class="text-muted-foreground text-sm">
        …
      </p>
      <template v-else>
        <select v-if="workspace" v-model="quoteMember" :aria-label="t.quotes.member" class="border-input h-8 w-48 rounded-md border bg-transparent px-2 text-sm">
          <option value="">
            {{ t.quotes.allMembers }}
          </option>
          <option v-for="m in members" :key="m.uid" :value="m.uid">
            {{ m.displayName }}
          </option>
        </select>
        <p v-if="!quoteGroups.length" class="text-muted-foreground py-10 text-center text-sm">
          {{ t.quotes.none }}
        </p>
        <section v-for="g in quoteGroups" :key="g.title" class="flex flex-col gap-2">
          <h2 class="font-medium">
            {{ g.title }}
          </h2>
          <QuoteList :sid="sid" :quotes="g.items" :name-of="workspace ? name : undefined" @removed="id => quotes = quotes!.filter(q => q.id !== id)" />
        </section>
      </template>
    </template>
    <p v-else-if="loading" class="text-muted-foreground text-sm">
      …
    </p>
    <template v-else-if="tab === 'space'">
      <section v-for="r in recSections" :key="r.key" class="mb-4 flex flex-col gap-2" :data-testid="`rec-${r.key}`">
        <h2 class="text-sm font-medium">
          {{ t.recs[r.key] }}
        </h2>
        <ul class="flex gap-3 overflow-x-auto pb-1">
          <li v-for="b in r.items" :key="b.id" class="flex w-24 shrink-0 flex-col gap-1">
            <img v-if="b.cover" :src="b.cover" alt="" class="aspect-[2/3] w-full rounded-md border object-cover">
            <div v-else class="bg-muted flex aspect-[2/3] w-full items-center justify-center rounded-md border p-1 text-center text-xs">
              {{ b.title }}
            </div>
            <span class="truncate text-xs font-medium">{{ b.title }}</span>
            <span v-if="r.key === 'topRated'" class="text-muted-foreground text-xs">★ {{ b.avgRating?.toFixed(1) }}</span>
          </li>
        </ul>
      </section>
      <p v-if="!books.length" class="text-muted-foreground py-10 text-center text-sm">
        {{ t.spaceEmpty }}
      </p>
      <ul v-else class="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <li v-for="b in books" :key="b.id" class="flex flex-col gap-1">
          <img v-if="b.cover" :src="b.cover" alt="" class="aspect-[2/3] w-full rounded-md border object-cover">
          <div v-else class="bg-muted flex aspect-[2/3] w-full items-center justify-center rounded-md border p-2 text-center text-sm">
            {{ b.title }}
          </div>
          <span class="truncate text-sm font-medium">{{ b.title }}</span>
          <span class="text-muted-foreground truncate text-xs" :title="b.readerUids.map(name).join(', ')">{{ t.readers(b.readerUids.length, b.readerUids.slice(0, 2).map(name)) }}</span>
          <span v-if="mineKeys.has(b.bookKey)" class="text-muted-foreground text-xs">{{ t.onShelf }}</span>
          <Button v-else size="sm" variant="outline" @click="join(b)">
            {{ t.join }}
          </Button>
        </li>
      </ul>
    </template>
    <p v-else-if="!shown.length" class="text-muted-foreground py-10 text-center text-sm">
      {{ t.empty }}
    </p>
    <ul v-else-if="view === 'list'" class="divide-y rounded-md border">
      <li v-for="b in shown" :key="b.id" class="flex items-center gap-3 p-2">
        <button type="button" class="flex min-w-0 flex-1 items-center gap-3 text-left" @click="openDetail(b)">
          <img v-if="b.cover" :src="b.cover" alt="" class="aspect-[2/3] w-10 shrink-0 rounded border object-cover">
          <div v-else class="bg-muted aspect-[2/3] w-10 shrink-0 rounded border" />
          <div class="flex min-w-0 flex-col">
            <span class="truncate text-sm font-medium">{{ b.title }}</span>
            <span class="text-muted-foreground truncate text-xs">{{ [b.authors.join(', '), t.formats[b.format]].filter(Boolean).join(' · ') }}</span>
            <span v-if="b.rating" class="text-xs text-amber-500">{{ '★'.repeat(b.rating) }}</span>
          </div>
        </button>
        <div class="flex w-56 shrink-0 items-center gap-1">
          <select :value="b.status" :aria-label="t.fields.status" class="border-input h-8 flex-1 rounded-md border bg-transparent px-1 text-xs" @change="changeStatus(b, ($event.target as HTMLSelectElement).value as ShelfStatus)">
            <option v-for="s in SHELF_STATUS" :key="s" :value="s">
              {{ t.statuses[s] }}
            </option>
          </select>
          <Button variant="ghost" size="icon" class="size-8" :aria-label="t.log.quick" :title="t.log.quick" @click="quickLog(b)">
            <PencilLineIcon />
          </Button>
          <Button variant="ghost" size="icon" class="size-8" :aria-label="t.remove" @click="remove(b)">
            <Trash2Icon />
          </Button>
        </div>
      </li>
    </ul>
    <ul v-else class="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <li v-for="b in shown" :key="b.id" class="group flex flex-col gap-1">
        <button type="button" class="flex flex-col gap-1 text-left" @click="openDetail(b)">
          <img v-if="b.cover" :src="b.cover" alt="" class="aspect-[2/3] w-full rounded-md border object-cover">
          <div v-else class="bg-muted flex aspect-[2/3] w-full items-center justify-center rounded-md border p-2 text-center text-sm">
            {{ b.title }}
          </div>
          <span class="truncate text-sm font-medium">{{ b.title }}</span>
          <span v-if="b.rating" class="text-xs text-amber-500">{{ '★'.repeat(b.rating) }}</span>
        </button>
        <span class="text-muted-foreground truncate text-xs">{{ [b.authors.join(', '), t.formats[b.format]].filter(Boolean).join(' · ') }}</span>
        <div class="flex items-center gap-1">
          <select :value="b.status" :aria-label="t.fields.status" class="border-input h-8 flex-1 rounded-md border bg-transparent px-1 text-xs" @change="changeStatus(b, ($event.target as HTMLSelectElement).value as ShelfStatus)">
            <option v-for="s in SHELF_STATUS" :key="s" :value="s">
              {{ t.statuses[s] }}
            </option>
          </select>
          <Button variant="ghost" size="icon" class="size-8" :aria-label="t.log.quick" :title="t.log.quick" @click="quickLog(b)">
            <PencilLineIcon />
          </Button>
          <Button variant="ghost" size="icon" class="size-8" :aria-label="t.remove" @click="remove(b)">
            <Trash2Icon />
          </Button>
        </div>
      </li>
    </ul>

    <AddBookDialog v-model:open="addOpen" :sid="sid" @saved="load" />
    <BookDetailDialog
      v-model:open="detailOpen" :sid="sid" :book="detail" :today="today" :workspace="workspace" :name-of="name" :reviews="!!space.current?.modules?.reviews && space.current?.modules?.notes !== false"
      @saved="load" @review="b => { detailOpen = false; reviewBook = b; reviewOpen = true }"
    />
    <NewReviewDialog v-model:open="reviewOpen" :sid="sid" :book="reviewBook" />
  </div>
</template>
