<script setup lang="ts">
import type { Member } from '~/features/space/services/invites'
import type { Deck, DeckFolder } from '~/features/vocab/services/decks'
import type { DeckProgress } from '~/features/vocab/services/srs'
import { FolderIcon, PlusIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { listMembers } from '~/features/space/services/invites'
import DeckFormDialog from '~/features/vocab/components/DeckFormDialog.vue'
import { createFolder, listDecks, listFolders } from '~/features/vocab/services/decks'
import { listMyProgress } from '~/features/vocab/services/srs'
import { errorMessage } from '~/lib/errors'
import { cn } from '~/lib/utils'
import { ko } from '~/locales/ko'

/** VOC-03·05: 단어장 목록 (폴더·태그로 거르기) */
const t = ko.vocab
const space = useSpaceStore()
const auth = useAuthStore()
const { $firestore } = useNuxtApp()

if (space.current?.modules?.vocab === false) {
  await navigateTo(`/s/${space.current.id}`, { replace: true })
}

const sid = computed(() => space.current!.id)
const uid = computed(() => auth.user!.uid)
const canCreate = computed(() => space.can('create'))

const decks = ref<Deck[]>([])
const folders = ref<DeckFolder[]>([])
const members = ref<Member[]>([])
const progress = ref(new Map<string, DeckProgress>())
const loading = ref(true)
const loadError = ref(false)
const folderFilter = ref<string>('all')
const tagFilter = ref('')
const createOpen = ref(false)
const newFolder = ref('')

const memberName = computed(() => new Map(members.value.map(m => [m.uid, m.displayName])))
const allTags = computed(() => [...new Set(decks.value.flatMap(d => d.tags))].sort((a, b) => a.localeCompare(b, 'ko')))
const shown = computed(() => decks.value
  .filter(d => folderFilter.value === 'all' || (folderFilter.value === 'none' ? !d.folderId : d.folderId === folderFilter.value))
  .filter(d => !tagFilter.value || d.tags.includes(tagFilter.value))
  .sort((a, b) => (b.updatedAt?.toMillis() ?? 0) - (a.updatedAt?.toMillis() ?? 0)))
const countIn = (folderId: string | null) => decks.value.filter(d => (d.folderId ?? null) === folderId).length

async function load() {
  loading.value = true
  try {
    const [d, f, m, p] = await Promise.all([
      listDecks($firestore, sid.value, uid.value),
      listFolders($firestore, sid.value),
      listMembers($firestore, sid.value),
      listMyProgress($firestore, sid.value, uid.value).catch(() => new Map<string, DeckProgress>()),
    ])
    progress.value = p
    decks.value = d
    folders.value = f
    members.value = m
    loadError.value = false
  }
  catch {
    loadError.value = true
  }
  finally {
    loading.value = false
  }
}
onMounted(load)
watch(sid, () => {
  folderFilter.value = 'all'
  tagFilter.value = ''
  load()
})

async function addFolder() {
  const name = newFolder.value.trim()
  if (!name) return
  try {
    await createFolder($firestore, sid.value, uid.value, name, folders.value.length)
    newFolder.value = ''
    folders.value = await listFolders($firestore, sid.value)
  }
  catch (error) {
    toast.error(errorMessage(error) ?? ko.errors.unknown)
  }
}

const folderButton = (active: boolean) => cn('flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm', active ? 'bg-muted font-medium' : 'hover:bg-muted/60')
</script>

<template>
  <div class="mx-auto flex w-full max-w-5xl flex-col gap-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-semibold">
        {{ t.title }}
      </h1>
      <div class="flex flex-col items-end gap-1">
        <Button :disabled="!canCreate" @click="createOpen = true">
          <PlusIcon />
          {{ t.create }}
        </Button>
        <p v-if="!canCreate" class="text-muted-foreground text-xs">
          {{ t.noCreatePermission }}
        </p>
      </div>
    </div>

    <p v-if="loadError" class="text-destructive text-sm">
      {{ ko.errors.unknown }}
    </p>

    <div class="flex flex-col gap-6 md:flex-row">
      <aside class="flex shrink-0 flex-col gap-1 md:w-52">
        <button type="button" :class="folderButton(folderFilter === 'all')" @click="folderFilter = 'all'">
          {{ t.folders.all }}<span class="text-muted-foreground text-xs">{{ decks.length }}</span>
        </button>
        <button v-for="folder in folders" :key="folder.id" type="button" :class="folderButton(folderFilter === folder.id)" @click="folderFilter = folder.id">
          <span class="flex min-w-0 items-center gap-2"><FolderIcon class="size-4 shrink-0" /><span class="truncate">{{ folder.name }}</span></span>
          <span class="text-muted-foreground text-xs">{{ countIn(folder.id) }}</span>
        </button>
        <button type="button" :class="folderButton(folderFilter === 'none')" @click="folderFilter = 'none'">
          {{ t.folders.unfiled }}<span class="text-muted-foreground text-xs">{{ countIn(null) }}</span>
        </button>
        <form class="mt-2 flex gap-1" @submit.prevent="addFolder">
          <Input v-model="newFolder" maxlength="40" :placeholder="t.folders.namePlaceholder" class="h-8 text-sm" />
          <Button type="submit" size="sm" variant="outline" :disabled="!newFolder.trim()" :aria-label="t.folders.create">
            <PlusIcon />
          </Button>
        </form>
      </aside>

      <section class="flex min-w-0 flex-1 flex-col gap-4">
        <div v-if="allTags.length" class="flex flex-wrap gap-1.5">
          <button type="button" :class="cn('rounded-full border px-3 py-0.5 text-xs', !tagFilter && 'bg-muted font-medium')" @click="tagFilter = ''">
            {{ t.allTags }}
          </button>
          <button v-for="tag in allTags" :key="tag" type="button" :class="cn('rounded-full border px-3 py-0.5 text-xs', tagFilter === tag && 'bg-muted font-medium')" @click="tagFilter = tag">
            #{{ tag }}
          </button>
        </div>

        <div v-if="loading" class="grid gap-3 sm:grid-cols-2">
          <Skeleton v-for="i in 4" :key="i" class="h-32 rounded-xl" />
        </div>
        <p v-else-if="!shown.length" class="text-muted-foreground py-10 text-center text-sm">
          {{ decks.length ? t.emptyFiltered : t.empty }}
        </p>
        <div v-else class="grid gap-3 sm:grid-cols-2">
          <NuxtLink v-for="deck in shown" :key="deck.id" :to="`/s/${sid}/decks/${deck.id}`" class="hover:border-primary/50 flex flex-col gap-2 rounded-xl border p-4 transition-colors">
            <div class="flex items-start justify-between gap-2">
              <h2 class="font-medium">
                {{ deck.title }}
              </h2>
              <Badge v-if="deck.visibility !== 'space' && space.current?.kind === 'workspace'" variant="secondary">
                {{ t.visibility[deck.visibility] }}
              </Badge>
            </div>
            <p v-if="deck.description" class="text-muted-foreground line-clamp-2 text-sm">
              {{ deck.description }}
            </p>
            <div v-if="deck.tags.length" class="flex flex-wrap gap-1">
              <span v-for="tag in deck.tags" :key="tag" class="text-muted-foreground text-xs">#{{ tag }}</span>
            </div>
            <div v-if="progress.get(deck.id) && deck.cardCount" class="mt-auto flex flex-col gap-1">
              <div class="bg-muted h-1.5 overflow-hidden rounded-full">
                <div class="bg-primary h-full" :style="{ width: `${Math.min(100, progress.get(deck.id)!.masteredCount / deck.cardCount * 100)}%` }" />
              </div>
              <span class="text-muted-foreground text-xs">{{ t.progress.percent(progress.get(deck.id)!.masteredCount, deck.cardCount) }}</span>
            </div>
            <div class="text-muted-foreground mt-auto flex flex-wrap gap-x-3 gap-y-1 text-xs">
              <span>{{ t.langs[deck.langFrom] }} → {{ t.langs[deck.langTo] }}</span>
              <span>{{ t.cardCount(deck.cardCount) }}</span>
              <span v-if="space.current?.kind === 'workspace'">{{ t.learnerCount(deck.learnerCount) }}</span>
              <span v-if="space.current?.kind === 'workspace' && memberName.get(deck.createdBy)">{{ t.by(memberName.get(deck.createdBy)!) }}</span>
            </div>
          </NuxtLink>
        </div>
      </section>
    </div>

    <DeckFormDialog v-model:open="createOpen" :folders="folders" :members="members" @saved="id => navigateTo(`/s/${sid}/decks/${id}`)" />
  </div>
</template>
