<script setup lang="ts">
import type { Page } from '~/features/notes/services/pages'
import BlockEditor from '~/features/notes/components/BlockEditor.vue'
import { getPage, loadBlocks } from '~/features/notes/services/pages'
import { blocksToMarkdown } from '~/features/notes/sync/serialize'
import { ko } from '~/locales/ko'

/** ACC-32: 이전 워크스페이스의 내 글을 읽기 전용으로 보고 마크다운으로 내려받는다 */
definePageMeta({ layout: 'focus' })
const t = ko.former
const route = useRoute()
const { $firestore } = useNuxtApp()
const sid = computed(() => String(route.params.sid))
const pageId = computed(() => String(route.params.pageId))
const page = ref<Page | null>(null)
const failed = ref(false)

watch([sid, pageId], async ([s, p]) => {
  page.value = await getPage($firestore, s, p).catch(() => null)
  failed.value = !page.value
}, { immediate: true })

async function download() {
  const title = page.value?.title || t.untitled
  const md = `# ${title}\n\n${blocksToMarkdown(await loadBlocks($firestore, sid.value, pageId.value))}`
  const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${title.replace(/[\\/:*?"<>|]/g, '_')}.md`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
</script>

<template>
  <div class="mx-auto w-full max-w-3xl space-y-4 p-6">
    <div class="flex items-center gap-2">
      <NuxtLink to="/former" class="text-sm text-muted-foreground hover:underline">
        ← {{ t.title }}
      </NuxtLink>
      <Button v-if="page" size="sm" variant="outline" class="ml-auto" @click="download">
        {{ t.download }}
      </Button>
    </div>
    <p v-if="failed" class="text-sm text-muted-foreground">
      {{ t.notFound }}
    </p>
    <template v-if="page">
      <h1 class="text-3xl font-bold">
        {{ page.icon }} {{ page.title || t.untitled }}
      </h1>
      <p class="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
        {{ t.readOnly }}
      </p>
      <BlockEditor :space-id="sid" :page-id="pageId" :editable="false" />
    </template>
  </div>
</template>
