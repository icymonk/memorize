<script setup lang="ts">
import type { Page } from '~/features/notes/services/pages'
import type { SaveStatus } from '~/features/notes/sync/writer'
import { ArrowLeftIcon, CloudOffIcon, LoaderIcon } from '@lucide/vue'
import { useDebounceFn } from '@vueuse/core'
import { LIMITS } from '#shared/limits'
import BlockEditor from '~/features/notes/components/BlockEditor.vue'
import { canEditPage, getPage, updatePageTitle } from '~/features/notes/services/pages'
import { SAVE_DELAY_MS } from '~/features/notes/sync/writer'
import { cn } from '~/lib/utils'
import { ko } from '~/locales/ko'

/** NOTE-01·10: 페이지 편집 — 블록 편집기와 자동 저장 상태 */
const t = ko.notes
const route = useRoute()
const space = useSpaceStore()
const auth = useAuthStore()
const { $firestore } = useNuxtApp()

const sid = computed(() => space.current!.id)
const pageId = computed(() => route.params.pageId as string)
const page = ref<Page | null>(null)
const loading = ref(true)
const loadError = ref(false)
const title = ref('')
const blockStatus = ref<SaveStatus>('saved')
const titleSaving = ref(false)
const titleFailed = ref(false)
const blockCount = ref(0)
const editorRef = ref<InstanceType<typeof BlockEditor>>()

const editable = computed(() => !!page.value && canEditPage(page.value, auth.user!.uid))
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
  <div class="mx-auto flex w-full max-w-3xl flex-col gap-4">
    <div class="flex items-center justify-between gap-3 text-sm">
      <NuxtLink :to="`/s/${sid}/notes`" class="text-muted-foreground hover:text-foreground flex items-center gap-1">
        <ArrowLeftIcon class="size-4" />
        {{ t.back }}
      </NuxtLink>
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
    </div>

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
      <input
        v-model="title"
        :readonly="!editable"
        maxlength="200"
        :placeholder="t.untitled"
        class="placeholder:text-muted-foreground/60 w-full bg-transparent text-3xl font-bold outline-none"
        @input="onTitle"
        @keydown.enter.prevent="editorRef?.focus()"
      >
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
      />
    </template>
  </div>
</template>
