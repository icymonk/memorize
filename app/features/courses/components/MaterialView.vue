<script setup lang="ts">
import type { Material } from '#shared/schemas/course'
import { officePreviewable, youtubeId } from '#shared/schemas/course'
import { formatBytes } from '#shared/schemas/upload'
import { DownloadIcon, ExternalLinkIcon } from '@lucide/vue'
import { fileUrl } from '~/features/files/services/uploads'
import { ko } from '~/locales/ko'
import MediaPlayer from './MediaPlayer.vue'

/** CRS-11~16 자료 보기: PDF·오디오·영상·이미지·링크는 화면 안에서, 문서는 미리보기(선택)·내려받기, 기타는 내려받기 */
const props = defineProps<{ material: Material }>()
const t = ko.courses.lesson
const { $storage } = useNuxtApp()
const url = ref<string | null>(null)
const failed = ref(false)
const preview = ref(false)

watchEffect(() => {
  const m = props.material
  failed.value = false
  if (m.url) url.value = m.url
  else if (m.path) fileUrl($storage, m.path).then(u => url.value = u).catch(() => failed.value = true)
})
const yt = computed(() => props.material.url ? youtubeId(props.material.url) : null)
const host = computed(() => {
  try {
    return props.material.url ? new URL(props.material.url).hostname : ''
  }
  catch {
    return ''
  }
})
const officeSrc = computed(() => url.value ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url.value)}` : '')
</script>

<template>
  <p v-if="failed" class="text-destructive text-sm">{{ ko.files.missing }}</p>
  <div v-else-if="url" class="flex flex-col gap-2">
    <iframe v-if="material.type === 'pdf'" :src="url" :title="material.title" class="h-[70svh] w-full rounded-md border" />
    <iframe
      v-else-if="yt"
      :src="`https://www.youtube-nocookie.com/embed/${yt}`"
      :title="material.title"
      class="aspect-video w-full rounded-md"
      allow="encrypted-media; picture-in-picture; fullscreen"
      allowfullscreen
    />
    <MediaPlayer v-else-if="material.type === 'audio' || material.type === 'video'" :src="url" :kind="material.type" :label="material.title" />
    <a v-else-if="material.type === 'image'" :href="url" target="_blank" rel="noopener">
      <img :src="url" :alt="material.title" class="max-h-96 rounded-md border object-contain">
    </a>
    <a v-else-if="material.type === 'link'" :href="url" target="_blank" rel="noopener noreferrer" class="hover:bg-accent flex items-center gap-2 rounded-md border p-2 text-sm">
      <ExternalLinkIcon class="size-4 shrink-0" />
      <span class="min-w-0 truncate">{{ host || url }}</span>
    </a>
    <template v-else-if="material.type === 'office' && officePreviewable(material.title)">
      <iframe v-if="preview" :src="officeSrc" :title="material.title" class="h-[70svh] w-full rounded-md border" />
      <div v-else class="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" @click="preview = true">{{ t.preview }}</Button>
        <span class="text-muted-foreground text-xs">{{ t.previewHint }}</span>
      </div>
    </template>
    <div v-if="material.path" class="flex items-center gap-2 text-xs">
      <Button as-child variant="ghost" size="sm">
        <a :href="url" target="_blank" rel="noopener" :download="material.title"><DownloadIcon /> {{ t.download }}</a>
      </Button>
      <span v-if="material.size != null" class="text-muted-foreground">{{ formatBytes(material.size) }}</span>
    </div>
  </div>
</template>
