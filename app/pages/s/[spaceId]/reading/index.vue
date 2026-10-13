<script setup lang="ts">
import type { ShelfStatus } from '#shared/schemas/book'
import type { BookGroup, ShelfItem } from '~/features/reading/services/shelf'
import type { Member } from '~/features/space/services/invites'
import { SHELF_STATUS } from '#shared/schemas/book'
import { PlusIcon, Trash2Icon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import AddBookDialog from '~/features/reading/components/AddBookDialog.vue'
import { listBooks, listMyShelf, removeFromShelf, setShelfStatus } from '~/features/reading/services/shelf'
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
const books = ref<BookGroup[]>([])
const members = ref<Member[]>([])
const loading = ref(true)
const tab = ref<'all' | ShelfStatus | 'space'>('all')
const addOpen = ref(false)

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
watch(sid, load)

async function changeStatus(b: ShelfItem, status: ShelfStatus) {
  await setShelfStatus($firestore, sid.value, b.id, status)
  b.status = status
}

async function remove(b: ShelfItem) {
  if (!await confirmDialog(t.removeConfirm(b.title))) return
  await removeFromShelf($firestore, sid.value, b.id)
  mine.value = mine.value.filter(x => x.id !== b.id)
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
      </TabsList>
    </Tabs>

    <p v-if="loading" class="text-muted-foreground text-sm">
      …
    </p>
    <template v-else-if="tab === 'space'">
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
        </li>
      </ul>
    </template>
    <p v-else-if="!shown.length" class="text-muted-foreground py-10 text-center text-sm">
      {{ t.empty }}
    </p>
    <ul v-else class="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <li v-for="b in shown" :key="b.id" class="group flex flex-col gap-1">
        <img v-if="b.cover" :src="b.cover" alt="" class="aspect-[2/3] w-full rounded-md border object-cover">
        <div v-else class="bg-muted flex aspect-[2/3] w-full items-center justify-center rounded-md border p-2 text-center text-sm">
          {{ b.title }}
        </div>
        <span class="truncate text-sm font-medium">{{ b.title }}</span>
        <span class="text-muted-foreground truncate text-xs">{{ [b.authors.join(', '), t.formats[b.format]].filter(Boolean).join(' · ') }}</span>
        <div class="flex items-center gap-1">
          <select :value="b.status" :aria-label="t.fields.status" class="border-input h-8 flex-1 rounded-md border bg-transparent px-1 text-xs" @change="changeStatus(b, ($event.target as HTMLSelectElement).value as ShelfStatus)">
            <option v-for="s in SHELF_STATUS" :key="s" :value="s">
              {{ t.statuses[s] }}
            </option>
          </select>
          <Button variant="ghost" size="icon" class="size-8" :aria-label="t.remove" @click="remove(b)">
            <Trash2Icon />
          </Button>
        </div>
      </li>
    </ul>

    <AddBookDialog v-model:open="addOpen" :sid="sid" @saved="load" />
  </div>
</template>
