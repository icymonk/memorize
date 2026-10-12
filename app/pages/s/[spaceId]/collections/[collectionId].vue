<script setup lang="ts">
import type { PropDef, PropValue, ViewDef, ViewType } from '#shared/schemas/collection'
import type { Page } from '~/features/notes/services/pages'
import { coerceProp, compareProp, MAX_VIEWS, matchesFilter, newPropKey, VIEW_TYPES, viewDef } from '#shared/schemas/collection'
import { ArrowDownIcon, ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon, FileTextIcon, PlusIcon, Settings2Icon, XIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import CollectionFormDialog from '~/features/notes/components/CollectionFormDialog.vue'
import PropCell from '~/features/notes/components/PropCell.vue'
import { canManageCollection, saveCollectionMeta } from '~/features/notes/services/collections'
import { canEditPage, setPageProp } from '~/features/notes/services/pages'
import { errorMessage } from '~/lib/errors'
import { cn } from '~/lib/utils'
import { ko } from '~/locales/ko'

/** NOTE-40~42·44·46~49: 모음 보기 — 리스트·표·캘린더, 필터·묶기·정렬, 보기 저장 */
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
const views = computed(() => (col.value?.views ?? []) as ViewDef[])
const settingsOpen = ref(false)
const creating = ref(false)

// 지금 보기 설정. 저장한 보기를 고르면 그 설정을 불러온다
const active = ref<string>('list')
const type = ref<ViewType>('list')
const filter = ref<{ key: string, value: string | boolean } | null>(null)
const sort = ref<{ key: string, dir: 1 | -1 } | null>(null)
const groupBy = ref<string | null>(null)
const dateKey = ref<string | null>(null)

function selectView(id: string) {
  active.value = id
  const v = views.value.find(x => x.id === id)
  type.value = v?.type ?? (id as ViewType)
  filter.value = v?.filter ?? null
  sort.value = v?.sort ?? null
  groupBy.value = v?.groupBy ?? null
  dateKey.value = v?.dateKey ?? null
}

const isManager = computed(() => ['owner', 'manager'].includes(space.membership?.access ?? ''))
const canManage = computed(() => !!col.value && canManageCollection(col.value, uid.value, isManager.value))
const canAdd = computed(() => !!col.value && (col.value.scope === 'private' ? col.value.ownerId === uid.value : space.can('create')))
const schema = computed(() => col.value?.schema ?? [])
const defOf = (key: string | null | undefined) => schema.value.find(d => d.key === key)
const filterDef = computed(() => defOf(filter.value?.key))
const groupable = computed(() => schema.value.filter(d => ['select', 'multiSelect', 'checkbox'].includes(d.type)))
const dateProps = computed(() => schema.value.filter(d => d.type === 'date'))
const calendarKey = computed(() => (defOf(dateKey.value)?.type === 'date' ? dateKey.value : dateProps.value[0]?.key ?? null))
const isEmpty = (x: unknown) => x === null || x === undefined || x === '' || (Array.isArray(x) && !x.length)

const items = computed(() => {
  const f = filter.value
  const list = notes.itemsOf(cid.value).filter(p => !f || matchesFilter(defOf(f.key), p.props?.[f.key], f.value))
  const s = sort.value
  if (!s) return list
  const value = (p: Page): PropValue | undefined => (s.key === 'title' ? p.title : p.props?.[s.key])
  return list.toSorted((a, b) => {
    const c = compareProp(value(a), value(b))
    return isEmpty(value(a)) || isEmpty(value(b)) ? c : c * s.dir
  })
})

/** NOTE-44 묶기: 태그는 태그마다 한 번씩, 값 없는 페이지는 맨 뒤 */
const sections = computed<{ label: string | null, items: Page[] }[]>(() => {
  const def = defOf(groupBy.value)
  if (!def) return [{ label: null, items: items.value }]
  const order = def.type === 'checkbox' ? [`✓ ${def.name}`] : def.options
  const map = new Map<string, Page[]>(order.map(o => [o, []]))
  const rest: Page[] = []
  for (const p of items.value) {
    const v = p.props?.[def.key]
    const keys = def.type === 'checkbox' ? (v === true ? [order[0]!] : []) : Array.isArray(v) ? v : typeof v === 'string' ? [v] : []
    if (!keys.length) rest.push(p)
    for (const k of keys) map.get(k)?.push(p)
  }
  return [...[...map].filter(([, l]) => l.length).map(([label, l]) => ({ label, items: l })), ...(rest.length ? [{ label: t.noGroup, items: rest }] : [])]
})

function sortBy(key: string) {
  const s = sort.value
  if (s?.key !== key) sort.value = { key, dir: 1 }
  else if (s.dir === 1) sort.value = { key, dir: -1 }
  else sort.value = null
}
function setFilterKey(key: string) {
  const def = defOf(key)
  filter.value = !def ? null : { key, value: def.type === 'checkbox' ? true : def.options[0] ?? '' }
}

function display(def: PropDef, v: PropValue | undefined): string {
  if (v === null || v === undefined || v === '' || v === false) return ''
  if (Array.isArray(v)) return v.join(', ')
  if (v === true) return `✓ ${def.name}`
  return String(v)
}
const shortDate = (p: Page) => (p.updatedAt ? p.updatedAt.toDate().toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }) : '')

// NOTE-41 캘린더: 일요일부터 6주
const month = ref(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const todayYmd = ymd(new Date())
const days = computed(() => {
  const first = month.value
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay())
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    return { ymd: ymd(d), day: d.getDate(), inMonth: d.getMonth() === first.getMonth() }
  })
})
const byDay = computed(() => {
  const map = new Map<string, Page[]>()
  const k = calendarKey.value
  if (!k) return map
  for (const p of items.value) {
    const v = p.props?.[k]
    if (typeof v === 'string') map.set(v, [...(map.get(v) ?? []), p])
  }
  return map
})
const shiftMonth = (n: number) => { month.value = new Date(month.value.getFullYear(), month.value.getMonth() + n, 1) }

async function add(props?: Record<string, PropValue>) {
  if (!col.value || creating.value) return
  creating.value = true
  try {
    const id = await notes.createItem(col.value, props)
    await navigateTo(`/s/${sid.value}/notes/${id}`)
  }
  catch (error) { toast.error(errorMessage(error) ?? ko.errors.unknown) }
  finally { creating.value = false }
}
function addOnDay(day: string) {
  if (canAdd.value && calendarKey.value) add({ [calendarKey.value]: day })
}

async function setProp(p: Page, def: PropDef, v: PropValue) {
  try { await setPageProp($firestore, sid.value, p.id, def.key, coerceProp(def, v)) }
  catch (error) { toast.error(errorMessage(error) ?? ko.errors.unknown) }
}

async function saveView() {
  if (!col.value) return
  const name = window.prompt(t.viewName, t.views[type.value])?.trim()
  if (!name) return
  const parsed = viewDef.safeParse({
    id: newPropKey(views.value.map(v => v.id)).replace('p', 'v'),
    name,
    type: type.value,
    filter: filter.value,
    sort: sort.value,
    groupBy: groupBy.value,
    dateKey: type.value === 'calendar' ? calendarKey.value : null,
  })
  if (!parsed.success) return toast.error(ko.errors.invalidInput)
  try {
    await saveCollectionMeta($firestore, sid.value, col.value.id, { views: [...views.value, parsed.data] })
    active.value = parsed.data.id
    toast.success(t.viewSaved(name))
  }
  catch (error) { toast.error(errorMessage(error) ?? ko.errors.unknown) }
}
async function removeView(id: string) {
  if (!col.value) return
  try {
    await saveCollectionMeta($firestore, sid.value, col.value.id, { views: views.value.filter(v => v.id !== id) })
    selectView(type.value)
  }
  catch (error) { toast.error(errorMessage(error) ?? ko.errors.unknown) }
}
async function onDeleted() {
  await navigateTo(`/s/${sid.value}/notes`)
}
const selectClass = 'border-input bg-background h-8 rounded-md border px-2 text-sm'
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
          <Button v-if="canAdd" :disabled="creating" @click="add()">
            <PlusIcon />
            {{ t.newItem }}
          </Button>
        </div>
      </div>
      <p class="text-muted-foreground -mt-2 text-xs">
        {{ t.scopes[col.scope] }}
      </p>

      <div class="flex flex-wrap items-center gap-1 border-b pb-2">
        <Button v-for="v in VIEW_TYPES" :key="v" size="sm" :variant="active === v ? 'secondary' : 'ghost'" @click="selectView(v)">
          {{ t.views[v] }}
        </Button>
        <span v-if="views.length" class="bg-border mx-1 h-5 w-px" />
        <div v-for="v in views" :key="v.id" class="flex items-center">
          <Button size="sm" :variant="active === v.id ? 'secondary' : 'ghost'" @click="selectView(v.id)">
            {{ v.name }}
          </Button>
          <Button v-if="canManage && active === v.id" size="icon" variant="ghost" class="size-7" :aria-label="t.deleteView" @click="removeView(v.id)">
            <XIcon class="size-3.5" />
          </Button>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2 text-sm">
        <select :class="selectClass" :aria-label="t.filter" :value="filter?.key ?? ''" @change="setFilterKey(($event.target as HTMLSelectElement).value)">
          <option value="">
            {{ t.filterNone }}
          </option>
          <option v-for="d in schema" :key="d.key" :value="d.key">
            {{ t.filter }}: {{ d.name }}
          </option>
        </select>
        <template v-if="filter && filterDef">
          <select v-if="filterDef.type === 'checkbox'" v-model="filter.value" :class="selectClass" :aria-label="filterDef.name">
            <option :value="true">
              ✓
            </option>
            <option :value="false">
              ✗
            </option>
          </select>
          <select v-else-if="filterDef.options.length" v-model="filter.value" :class="selectClass" :aria-label="filterDef.name">
            <option v-for="o in filterDef.options" :key="o" :value="o">
              {{ o }}
            </option>
          </select>
          <Input v-else v-model="(filter.value as string)" class="h-8 w-40" maxlength="100" :aria-label="filterDef.name" />
        </template>
        <select v-if="type !== 'calendar' && groupable.length" v-model="groupBy" :class="selectClass" :aria-label="t.groupBy">
          <option :value="null">
            {{ t.groupNone }}
          </option>
          <option v-for="d in groupable" :key="d.key" :value="d.key">
            {{ t.groupBy }}: {{ d.name }}
          </option>
        </select>
        <select v-if="type === 'calendar' && dateProps.length > 1" :value="calendarKey" :class="selectClass" :aria-label="t.dateProp" @change="dateKey = ($event.target as HTMLSelectElement).value">
          <option v-for="d in dateProps" :key="d.key" :value="d.key">
            {{ t.dateProp }}: {{ d.name }}
          </option>
        </select>
        <Button v-if="canManage && views.length < MAX_VIEWS" size="sm" variant="outline" class="ml-auto" @click="saveView">
          {{ t.saveView }}
        </Button>
      </div>

      <template v-if="type === 'calendar'">
        <p v-if="!calendarKey" class="text-muted-foreground py-12 text-center text-sm">
          {{ t.needDateProp }}
        </p>
        <div v-else class="flex flex-col gap-2">
          <div class="flex items-center gap-2">
            <Button size="icon" variant="ghost" :aria-label="t.prevMonth" @click="shiftMonth(-1)">
              <ChevronLeftIcon />
            </Button>
            <span class="min-w-28 text-center font-medium">{{ month.getFullYear() }}. {{ month.getMonth() + 1 }}</span>
            <Button size="icon" variant="ghost" :aria-label="t.nextMonth" @click="shiftMonth(1)">
              <ChevronRightIcon />
            </Button>
            <Button size="sm" variant="ghost" @click="month = new Date(new Date().getFullYear(), new Date().getMonth(), 1)">
              {{ t.today }}
            </Button>
          </div>
          <div class="grid grid-cols-7 overflow-hidden rounded-lg border text-sm">
            <div v-for="w in t.week" :key="w" class="bg-muted/50 text-muted-foreground border-b px-2 py-1 text-xs">
              {{ w }}
            </div>
            <div
              v-for="d in days"
              :key="d.ymd"
              :class="cn('flex min-h-24 flex-col gap-1 border-b border-r p-1', !d.inMonth && 'bg-muted/30 text-muted-foreground', canAdd && 'cursor-pointer hover:bg-muted/40')"
              @click.self="addOnDay(d.ymd)"
            >
              <span :class="cn('pointer-events-none w-6 rounded-full text-center text-xs', d.ymd === todayYmd && 'bg-primary text-primary-foreground')">{{ d.day }}</span>
              <NuxtLink
                v-for="p in byDay.get(d.ymd) ?? []"
                :key="p.id"
                :to="`/s/${sid}/notes/${p.id}`"
                class="bg-secondary hover:bg-secondary/70 truncate rounded px-1.5 py-0.5 text-xs"
              >
                {{ p.icon }} {{ p.title || ko.notes.untitled }}
              </NuxtLink>
            </div>
          </div>
        </div>
      </template>

      <p v-else-if="notes.loaded && !items.length" class="text-muted-foreground py-12 text-center text-sm">
        {{ t.noItems }}
      </p>

      <template v-else>
        <section v-for="s in sections" :key="s.label ?? ''" class="flex flex-col gap-2">
          <h2 v-if="s.label" class="text-muted-foreground text-sm font-medium">
            {{ s.label }} <span class="text-xs">{{ s.items.length }}</span>
          </h2>
          <ul v-if="type === 'list'" class="flex flex-col gap-2">
            <li v-for="p in s.items" :key="p.id">
              <NuxtLink :to="`/s/${sid}/notes/${p.id}`" class="hover:bg-muted/60 flex flex-col gap-1 rounded-lg border p-3">
                <span class="flex items-center gap-2 font-medium">
                  <span v-if="p.icon">{{ p.icon }}</span>
                  <FileTextIcon v-else class="text-muted-foreground size-4" />
                  <span class="truncate">{{ p.title || ko.notes.untitled }}</span>
                  <span class="text-muted-foreground ml-auto shrink-0 text-xs font-normal">{{ shortDate(p) }}</span>
                </span>
                <span v-if="p.excerpt" class="text-muted-foreground line-clamp-2 text-sm">{{ p.excerpt }}</span>
                <span v-if="schema.some(d => display(d, p.props?.[d.key]))" class="flex flex-wrap gap-1">
                  <template v-for="d in schema" :key="d.key">
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
                  <th v-for="h in [{ key: 'title', name: t.titleCol }, ...schema]" :key="h.key" class="px-2 py-2 font-medium">
                    <button type="button" class="hover:text-foreground flex items-center gap-1" @click="sortBy(h.key)">
                      {{ h.name }}
                      <ArrowUpIcon v-if="sort?.key === h.key && sort.dir === 1" class="size-3" />
                      <ArrowDownIcon v-else-if="sort?.key === h.key" class="size-3" />
                    </button>
                  </th>
                  <th class="px-2 py-2 font-medium">
                    {{ t.updatedCol }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="p in s.items" :key="p.id" class="border-t">
                  <td class="max-w-72 px-2 py-1">
                    <NuxtLink :to="`/s/${sid}/notes/${p.id}`" class="flex items-center gap-1.5 truncate font-medium hover:underline">
                      <span v-if="p.icon">{{ p.icon }}</span>
                      {{ p.title || ko.notes.untitled }}
                    </NuxtLink>
                  </td>
                  <td v-for="d in schema" :key="d.key" :class="cn('px-1 py-1', d.type === 'checkbox' ? 'text-center' : 'min-w-36')">
                    <PropCell :def="d" :value="p.props?.[d.key]" :readonly="!canEditPage(p, uid)" @update="setProp(p, d, $event)" />
                  </td>
                  <td class="text-muted-foreground px-2 py-1 text-xs whitespace-nowrap">
                    {{ shortDate(p) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>
    </template>
    <CollectionFormDialog v-if="col" v-model:open="settingsOpen" :collection="col" :items="notes.itemsOf(col.id)" @deleted="onDeleted" />
  </div>
</template>
