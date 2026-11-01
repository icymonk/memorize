<script setup lang="ts">
import type { LinkRefType } from '../services/pageLinks'
import type { Page } from '../services/pages'
import { FileTextIcon } from '@lucide/vue'
import { ko } from '~/locales/ko'
import { listLinkingPages } from '../services/pageLinks'

/** NOTE-24 "이 페이지를 언급한 페이지", NOTE-25 관련 노트. 볼 수 있는 페이지가 없으면 숨긴다 */
const props = defineProps<{ sid: string, refType: LinkRefType, refId: string }>()
const t = ko.notes.backlinks
const { $firestore } = useNuxtApp()
const pages = ref<Page[]>([])

watch(() => [props.sid, props.refType, props.refId], async () => {
  pages.value = await listLinkingPages($firestore, props.sid, props.refType, props.refId).catch(() => [])
}, { immediate: true })
</script>

<template>
  <section v-if="pages.length" class="flex flex-col gap-2" :aria-label="refType === 'page' ? t.mentioned : t.related" data-testid="related-notes">
    <h2 class="text-sm font-semibold">{{ refType === 'page' ? t.mentioned : t.related }}</h2>
    <ul class="flex flex-col gap-1">
      <li v-for="p in pages" :key="p.id">
        <NuxtLink :to="`/s/${sid}/notes/${p.id}`" class="hover:bg-accent flex items-center gap-2 rounded-md px-2 py-1 text-sm">
          <span v-if="p.icon">{{ p.icon }}</span><FileTextIcon v-else class="text-muted-foreground size-4" />
          <span class="truncate">{{ p.title || t.untitled }}</span>
        </NuxtLink>
      </li>
    </ul>
  </section>
</template>
