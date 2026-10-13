<script setup lang="ts">
import type { Page } from '~/features/notes/services/pages'
import type { SaveStatus } from '~/features/notes/sync/writer'
import { ArrowLeftIcon, ChevronRightIcon, CloudOffIcon, LoaderIcon, SmileIcon, StarIcon, Trash2Icon, CopyIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { useDebounceFn } from '@vueuse/core'
import { LIMITS } from '#shared/limits'
import BlockEditor from '~/features/notes/components/BlockEditor.vue'
import type { PropDef, PropValue } from '#shared/schemas/collection'
import { coerceProp } from '#shared/schemas/collection'
import CopyDeckDialog from '~/features/vocab/components/CopyDeckDialog.vue'
import JournalSummary from '~/features/notes/components/JournalSummary.vue'
import IconPicker from '~/features/notes/components/IconPicker.vue'
import PageComments from '~/features/notes/components/PageComments.vue'
import PageFeedback from '~/features/notes/components/PageFeedback.vue'
import PageReactions from '~/features/notes/components/PageReactions.vue'
import PropCell from '~/features/notes/components/PropCell.vue'
import { useTags } from '~/features/space/composables/useTags'
import { ensureTags, isTagProp, tagAwareDef, withTags } from '~/features/space/services/tags'
import ShareDialog from '~/features/notes/components/ShareDialog.vue'
import { canEditPage, getPage, LOCK_REFRESH_MS, setLock, setPageProp, updatePageIcon, updatePageTitle } from '~/features/notes/services/pages'
import { SAVE_DELAY_MS } from '~/features/notes/sync/writer'
import { errorMessage } from '~/lib/errors'
import { cn } from '~/lib/utils'
import { ko } from '~/locales/ko'

/** NOTE-01·10: 페이지 편집 — 블록 편집기와 자동 저장 상태 */
const t = ko.notes
const route = useRoute()
const space = useSpaceStore()
const auth = useAuthStore()
const { $firestore } = useNuxtApp()
const spaceTags = useTags()
const defs = computed(() => (collection.value?.schema ?? []).map(d => withTags(d, spaceTags.value)))

const sid = computed(() => space.current!.id)
/** 페이지마다 새로 마운트해서 편집기·잠금·자동 저장 상태가 이전 페이지와 섞이지 않게 한다 */
const mountedPageId = route.params.pageId as string
const pageId = computed(() => mountedPageId)
definePageMeta({ key: r => r.fullPath })
const page = ref<Page | null>(null)
const loading = ref(true)
const loadError = ref(false)
const title = ref('')
const blockStatus = ref<SaveStatus>('saved')
const titleSaving = ref(false)
const titleFailed = ref(false)
const blockCount = ref(0)
const editorRef = ref<InstanceType<typeof BlockEditor>>()
const notes = useNotesStore()
const headings = ref<{ id: string, level: number, text: string }[]>([])
const crumbs = computed(() => (page.value ? notes.ancestors(page.value) : []))
const canTrash = computed(() => !!page.value && !page.value.deletedAt && (page.value.ownerId === auth.user!.uid || ['owner', 'manager'].includes(space.membership?.access ?? '')))
/** 사이드바에서 제목을 바꾸면 여기도 따라간다 */
watch(() => notes.byId.get(pageId.value)?.title, (v) => { if (v !== undefined && !titleSaving.value) title.value = v })

function jump(id: string) {
  document.querySelector(`.note-editor [data-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
async function toTrash() {
  if (!page.value || !(await confirmDialog(t.trashConfirm(page.value.title || t.untitled)))) return
  try {
    editorRef.value?.flush()
    await notes.trash(page.value.id)
    toast.success(t.trashed)
    await navigateTo(`/s/${sid.value}/notes`)
  }
  catch (error) { toast.error(errorMessage(error) ?? ko.errors.unknown) }
}

const shareOpen = ref(false)
const live = computed(() => notes.byId.get(pageId.value) ?? page.value)
/** NOTE-60: 다른 사람이 90초 안에 갱신한 잠금이 있으면 읽기만 */
const lockedBy = computed(() => {
  const l = live.value?.lock
  if (!l || l.uid === auth.user!.uid || !l.at) return null
  return Date.now() - l.at.toMillis() < 90_000 ? l.name : null
})
const canEdit = computed(() => !!page.value && !page.value.deletedAt && canEditPage(live.value ?? page.value, auth.user!.uid))
const editable = computed(() => canEdit.value && !lockedBy.value)
let lockTimer: ReturnType<typeof setInterval> | undefined
const myName = () => auth.user?.displayName || auth.user?.email?.split('@')[0] || ''
function holdLock() {
  if (!canEdit.value || lockedBy.value) return
  setLock($firestore, sid.value, pageId.value, { uid: auth.user!.uid, name: myName() }).catch(() => {})
}
watch(canEdit, (v) => {
  clearInterval(lockTimer)
  if (!v) return
  holdLock()
  lockTimer = setInterval(holdLock, LOCK_REFRESH_MS)
})
onBeforeUnmount(() => {
  clearInterval(lockTimer)
  if (canEdit.value && !lockedBy.value) setLock($firestore, sid.value, pageId.value, null).catch(() => {})
})
async function setIcon(icon: string) {
  try {
    await updatePageIcon($firestore, sid.value, pageId.value, icon)
    if (page.value) page.value = { ...page.value, icon }
  }
  catch (error) { toast.error(errorMessage(error) ?? ko.errors.unknown) }
}
const icon = computed(() => live.value?.icon ?? page.value?.icon ?? '')
const copyOpen = ref(false)

/** NOTE-46: 모음 페이지는 제목 아래에 항목 값을 보여 준다 */
const collection = computed(() => (live.value?.collectionId ? notes.collections.find(c => c.id === live.value!.collectionId) ?? null : null))
async function setProp(def: PropDef, v: PropValue) {
  const value = coerceProp(tagAwareDef(def, v), v)
  if (isTagProp(def) && Array.isArray(value)) void ensureTags($firestore, sid.value, auth.user!.uid, value, spaceTags.value)
  try { await setPageProp($firestore, sid.value, pageId.value, def.key, value) }
  catch (error) { toast.error(errorMessage(error) ?? ko.errors.unknown) }
}
const status = computed<SaveStatus>(() => {
  if (blockStatus.value !== 'saved') return blockStatus.value
  if (titleFailed.value) return 'error'
  return titleSaving.value ? 'saving' : 'saved'
})

async function load() {
  loading.value = true
  try {
    page.value = await getPage($firestore, sid.value, pageId.value)
    title.value = page.value?.title ?? ''
    if (page.value && !page.value.deletedAt) notes.visit(page.value)
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

const saveTitle = useDebounceFn(async () => {
  try {
    await updatePageTitle($firestore, sid.value, pageId.value, title.value.trim().slice(0, 200))
    titleFailed.value = false
  }
  catch {
    titleFailed.value = true
  }
  finally {
    titleSaving.value = false
  }
}, SAVE_DELAY_MS)
function onTitle() {
  titleSaving.value = true
  saveTitle()
}

onBeforeRouteLeave(() => { editorRef.value?.flush() })
</script>

<template>
  <div class="mx-auto flex w-full max-w-5xl gap-8">
  <div class="flex min-w-0 max-w-3xl flex-1 flex-col gap-4">
    <div class="flex items-center justify-between gap-3 text-sm">
      <nav class="text-muted-foreground flex min-w-0 items-center gap-1">
        <NuxtLink :to="`/s/${sid}/notes`" class="hover:text-foreground flex shrink-0 items-center gap-1">
          <ArrowLeftIcon class="size-4" />
          {{ t.back }}
        </NuxtLink>
        <template v-if="collection">
          <ChevronRightIcon class="size-3.5 shrink-0" />
          <NuxtLink :to="`/s/${sid}/collections/${collection.id}`" class="hover:text-foreground max-w-40 truncate">{{ collection.icon }} {{ collection.name }}</NuxtLink>
        </template>
        <template v-for="c in crumbs" :key="c.id">
          <ChevronRightIcon class="size-3.5 shrink-0" />
          <NuxtLink :to="`/s/${sid}/notes/${c.id}`" class="hover:text-foreground max-w-40 truncate">{{ c.icon }} {{ c.title || t.untitled }}</NuxtLink>
        </template>
      </nav>
      <span class="flex shrink-0 items-center gap-1">
      <span
        v-if="page && editable"
        role="status"
        :class="cn('flex items-center gap-1.5 text-xs', status === 'error' || status === 'tooLarge' ? 'text-destructive' : 'text-muted-foreground')"
      >
        <LoaderIcon v-if="status === 'saving'" class="size-3.5 animate-spin" />
        <CloudOffIcon v-else-if="status === 'offline'" class="size-3.5" />
        {{ t.status[status] }}
      </span>
      <span v-else-if="page" class="text-muted-foreground text-xs">{{ t.readOnly }}</span>
        <Button v-if="page && !page.deletedAt" variant="ghost" size="icon" class="size-8" :aria-label="notes.isFavorite(page.id) ? t.removeFavorite : t.addFavorite" @click="notes.toggleFavorite(page.id)">
          <StarIcon :class="notes.isFavorite(page.id) && 'fill-amber-400 text-amber-500'" />
        </Button>
        <Button v-if="page && !page.deletedAt" variant="ghost" size="icon" class="size-8" :aria-label="t.copy.button" :title="t.copy.button" @click="copyOpen = true">
          <CopyIcon />
        </Button>
        <Button v-if="page && page.ownerId === auth.user?.uid && !page.deletedAt" variant="ghost" size="sm" @click="shareOpen = true">
          {{ t.share.button }}
        </Button>
        <Button v-if="canTrash" variant="ghost" size="icon" class="size-8" :aria-label="t.moveToTrash" @click="toTrash">
          <Trash2Icon />
        </Button>
      </span>
    </div>
    <p v-if="page?.deletedAt" class="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
      {{ t.inTrash }}
    </p>
    <p v-else-if="lockedBy" class="bg-muted rounded-md px-3 py-2 text-sm">
      {{ t.editingBy(lockedBy) }}
    </p>
    <CopyDeckDialog v-if="page" v-model:open="copyOpen" kind="page" :from-space-id="sid" :content-id="page.id" />
    <ShareDialog v-if="page" v-model:open="shareOpen" :page="live ?? page" @saved="page = { ...page!, ...$event }" />

    <p v-if="loadError" class="text-destructive text-sm">
      {{ t.loadFailed }}
    </p>
    <div v-else-if="loading" class="flex flex-col gap-3">
      <Skeleton class="h-10 w-1/2" />
      <Skeleton class="h-5 w-3/4" />
    </div>
    <p v-else-if="!page" class="text-muted-foreground py-12 text-center text-sm">
      {{ t.notFound }}
    </p>
    <template v-else>
      <div class="group/icon -mb-2 flex min-h-8 items-end">
        <IconPicker v-if="editable" @pick="setIcon">
          <button v-if="icon" type="button" class="hover:bg-muted rounded-md px-1 text-5xl leading-tight" :aria-label="t.icon.change">
            {{ icon }}
          </button>
          <Button v-else variant="ghost" size="sm" class="text-muted-foreground opacity-0 group-hover/icon:opacity-100 focus-visible:opacity-100">
            <SmileIcon />
            {{ t.icon.add }}
          </Button>
        </IconPicker>
        <span v-else-if="icon" class="px-1 text-5xl leading-tight">{{ icon }}</span>
      </div>
      <input
        v-model="title"
        :readonly="!editable"
        maxlength="200"
        :placeholder="t.untitled"
        class="placeholder:text-muted-foreground/60 w-full bg-transparent text-3xl font-bold outline-none"
        @input="onTitle"
        @keydown.enter.prevent="editorRef?.focus()"
      >
      <p v-if="live?.copiedFrom" class="text-muted-foreground -mt-2 text-xs">
        {{ t.copy.from(live.copiedFrom.spaceName ?? '') }}
      </p>
      <dl v-if="collection?.schema.length" class="grid grid-cols-[8rem_1fr] items-center gap-x-3 gap-y-1 text-sm">
        <template v-for="d in defs" :key="d.key">
          <dt class="text-muted-foreground truncate">{{ d.name }}</dt>
          <dd class="min-w-0">
            <PropCell :def="d" :value="live?.props?.[d.key]" :readonly="!editable" @update="setProp(d, $event)" />
          </dd>
        </template>
      </dl>
      <JournalSummary
        v-if="live?.type === 'journal' && typeof live.props?.date === 'string'"
        :sid="sid"
        :owner-id="live.ownerId"
        :date="live.props.date"
        :minutes="live.props.minutes"
        :editable="editable"
        @fill-minutes="(m) => collection && setProp(collection.schema.find(d => d.key === 'minutes') ?? { key: 'minutes', name: '', type: 'number', options: [] }, m)"
      />
      <p v-if="blockCount > LIMITS.pageBlockWarn" class="text-muted-foreground text-xs">
        {{ t.tooManyBlocks(LIMITS.pageBlockWarn) }}
      </p>
      <BlockEditor
        ref="editorRef"
        :space-id="sid"
        :page-id="pageId"
        :editable="editable"
        @status="blockStatus = $event"
        @loaded="blockCount = $event"
        @error="loadError = true"
        @headings="headings = $event"
      />
      <PageReactions v-if="page && !page.deletedAt" :sid="sid" :page-id="pageId" />
      <PageFeedback v-if="page && !page.deletedAt && space.current?.kind !== 'personal'" :sid="sid" :page="live ?? page" @saved="page = { ...page!, ...$event }" />
      <PageComments v-if="page && !page.deletedAt" :sid="sid" :page-id="pageId" />
    </template>
  </div>
  <aside v-if="headings.length" class="sticky top-4 hidden w-48 shrink-0 self-start xl:block">
    <p class="text-muted-foreground mb-2 text-xs font-medium">
      {{ t.toc }}
    </p>
    <ul class="flex flex-col gap-1 text-sm">
      <li v-for="h in headings" :key="h.id" :style="{ paddingLeft: `${(h.level - 1) * 12}px` }">
        <button type="button" class="text-muted-foreground hover:text-foreground line-clamp-2 text-left" @click="jump(h.id)">
          {{ h.text || t.untitled }}
        </button>
      </li>
    </ul>
  </aside>
  </div>
</template>
