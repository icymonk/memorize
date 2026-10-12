<script setup lang="ts">
import type { PropDef, PropValue, ViewType } from '#shared/schemas/collection'
import type { Page } from '~/features/notes/services/pages'
import { coerceProp, compareProp, VIEW_TYPES } from '#shared/schemas/collection'
import { ArrowDownIcon, ArrowUpIcon, FileTextIcon, PlusIcon, Settings2Icon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import CollectionFormDialog from '~/features/notes/components/CollectionFormDialog.vue'
import PropCell from '~/features/notes/components/PropCell.vue'
import { canManageCollection } from '~/features/notes/services/collections'
import { canEditPage, setPageProp } from '~/features/notes/services/pages'
import { errorMessage } from '~/lib/errors'
import { cn } from '~/lib/utils'
import { ko } from '~/locales/ko'

/** NOTE-40·42·46·47·49: 모음 보기 — 리스트(최신순)·표(바로 고치기, 열 눌러 정렬) */
const t = ko.notes.collections
const route = useRoute()
const space = useSpaceStore()
const auth = useAuthStore()
const notes = useNotesStore()
const { $firestore } = useNuxtApp()

if (space.current?.modules?.notes === false) {
  await navigateTo(`/s/${space.current.id}`, { replace: true })
}

const sid = computed(() => space.current!.id)
const uid = computed(() => auth.user!.uid)
const cid = computed(() => route.params.collectionId as string)
const col = computed(() => notes.collections.find(c => c.id === cid.value) ?? null)
const view = ref<ViewType>('list')
const sortKey = ref<string | null>(null)
const sortDir = ref<1 | -1>(1)
const settingsOpen = ref(false)
const creating = ref(false)

const isManager = computed(() => ['owner', 'manager'].includes(space.membership?.access ?? ''))
const canManage = computed(() => !!col.value && canManageCollection(col.value, uid.value, isManager.value))
const canAdd = computed(() => !!col.value && (col.value.scope === 'private' ? col.value.ownerId === uid.value : space.can('create')))
const items = computed(() => {
  const list = notes.itemsOf(cid.value)
  const k = sortKey.value
  if (!k) return list
  const value = (p: Page): PropValue | undefined => (k === 'title' ? p.title : p.props?.[k])
  return list.toSorted((a, b) => {
    const c = compareProp(value(a), value(b))
    const empty = (x: unknown) => x === null || x === undefined || x === '' || (Array.isArray(x) && !x.length)
    return empty(value(a)) || empty(value(b)) ? c : c * sortDir.value
  })
})

function sortBy(key: string) {
  if (sortKey.value !== key) {
    sortKey.value = key
    sortDir.value = 1
  }
  else if (sortDir.value === 1) { sortDir.value = -1 }
  else { sortKey.value = null }
}

function display(def: PropDef, v: PropValue | undefined): string {
  if (v === null || v === undefined || v === '' || v === false) return ''
  if (Array.isArray(v)) return v.join(', ')
  if (v === true) return `✓ ${def.name}`
  return String(v)
}
const shortDate = (p: Page) => (p.updatedAt ? p.updatedAt.toDate().toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }) : '')

async function add() {
  if (!col.value) return
  creating.value = true
  try {
    const id = await notes.createItem(col.value)
    await navigateTo(`/s/${sid.value}/notes/${id}`)
  }
  catch (error) { toast.error(errorMessage(error) ?? ko.errors.unknown) }
  finally { creating.value = false }
}

async function setProp(p: Page, def: PropDef, v: PropValue) {
  try { await setPageProp($firestore, sid.value, p.id, def.key, coerceProp(def, v)) }
  catch (error) { toast.error(errorMessage(error) ?? ko.errors.unknown) }
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-5xl flex-col gap-4">
    <div v-if="!col && !notes.loaded" class="flex flex-col gap-3">
      <Skeleton class="h-9 w-1/3" />
      <Skeleton class="h-24 w-full" />
    </div>
    <p v-else-if="!col" class="text-muted-foreground py-12 text-center text-sm">
      {{ t.notFound }}
    </p>
    <template v-else>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h1 class="flex min-w-0 items-center gap-2 text-2xl font-bold">
          <span v-if="col.icon">{{ col.icon }}</span>
          <span class="truncate">{{ col.name }}</span>
        </h1>
        <div class="flex items-center gap-2">
          <Button v-if="canManage" variant="ghost" size="icon" :aria-label="t.settings" @click="settingsOpen = true">
            <Settings2Icon />
          </Button>
          <Button v-if="canAdd" :disabled="creating" @click="add">
            <PlusIcon />
            {{ t.newItem }}
          </Button>
        </div>
      </div>
      <p class="text-muted-foreground -mt-2 text-xs">
        {{ t.scopes[col.scope] }}
      </p>

      <Tabs v-model="view">
        <TabsList>
          <TabsTrigger v-for="v in VIEW_TYPES" :key="v" :value="v">
            {{ t.views[v] }}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <p v-if="notes.loaded && !items.length" class="text-muted-foreground py-12 text-center text-sm">
        {{ t.noItems }}
      </p>

      <ul v-else-if="view === 'list'" class="flex flex-col gap-2">
        <li v-for="p in items" :key="p.id">
          <NuxtLink :to="`/s/${sid}/notes/${p.id}`" class="hover:bg-muted/60 flex flex-col gap-1 rounded-lg border p-3">
            <span class="flex items-center gap-2 font-medium">
              <span v-if="p.icon">{{ p.icon }}</span>
              <FileTextIcon v-else class="text-muted-foreground size-4" />
              <span class="truncate">{{ p.title || ko.notes.untitled }}</span>
              <span class="text-muted-foreground ml-auto shrink-0 text-xs font-normal">{{ shortDate(p) }}</span>
            </span>
            <span v-if="p.excerpt" class="text-muted-foreground line-clamp-2 text-sm">{{ p.excerpt }}</span>
            <span v-if="col.schema.some(d => display(d, p.props?.[d.key]))" class="flex flex-wrap gap-1">
              <template v-for="d in col.schema" :key="d.key">
                <span v-if="display(d, p.props?.[d.key])" class="bg-secondary rounded px-1.5 py-0.5 text-xs">{{ display(d, p.props?.[d.key]) }}</span>
              </template>
            </span>
          </NuxtLink>
        </li>
      </ul>

      <div v-else class="overflow-x-auto rounded-lg border">
        <table class="w-full min-w-max text-sm">
          <thead class="bg-muted/50 text-muted-foreground text-left text-xs">
            <tr>
              <th v-for="h in [{ key: 'title', name: t.titleCol }, ...col.schema]" :key="h.key" class="px-2 py-2 font-medium">
                <button type="button" class="hover:text-foreground flex items-center gap-1" @click="sortBy(h.key)">
                  {{ h.name }}
                  <ArrowUpIcon v-if="sortKey === h.key && sortDir === 1" class="size-3" />
                  <ArrowDownIcon v-else-if="sortKey === h.key" class="size-3" />
                </button>
              </th>
              <th class="px-2 py-2 font-medium">
                {{ t.updatedCol }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in items" :key="p.id" class="border-t">
              <td class="max-w-72 px-2 py-1">
                <NuxtLink :to="`/s/${sid}/notes/${p.id}`" class="hover:underline flex items-center gap-1.5 truncate font-medium">
                  <span v-if="p.icon">{{ p.icon }}</span>
                  {{ p.title || ko.notes.untitled }}
                </NuxtLink>
              </td>
              <td v-for="d in col.schema" :key="d.key" :class="cn('px-1 py-1', d.type === 'checkbox' ? 'text-center' : 'min-w-36')">
                <PropCell :def="d" :value="p.props?.[d.key]" :readonly="!canEditPage(p, uid)" @update="setProp(p, d, $event)" />
              </td>
              <td class="text-muted-foreground px-2 py-1 text-xs whitespace-nowrap">
                {{ shortDate(p) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
    <CollectionFormDialog v-if="col" v-model:open="settingsOpen" :collection="col" />
  </div>
</template>
