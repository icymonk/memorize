<script setup lang="ts">
import type { Attachment } from '#shared/schemas/upload'
import { formatBytes } from '#shared/schemas/upload'
import { FileIcon, XIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { ko } from '~/locales/ko'
import { fileUrl } from '../services/uploads'

/** CMN-60: 첨부 목록. 사진은 작은 미리보기, 나머지는 이름·크기. 누르면 새 탭에서 연다 */
const props = defineProps<{ files: Attachment[], removable?: boolean }>()
const emit = defineEmits<{ remove: [id: string] }>()
const { $storage } = useNuxtApp()
const thumbs = ref<Record<string, string>>({})

watchEffect(() => {
  for (const f of props.files) {
    if (f.contentType.startsWith('image/') && !(f.id in thumbs.value)) {
      thumbs.value[f.id] = ''
      fileUrl($storage, f.path).then(u => thumbs.value[f.id] = u).catch(() => {})
    }
  }
})

async function open(f: Attachment) {
  try { window.open(thumbs.value[f.id] || await fileUrl($storage, f.path), '_blank', 'noopener') }
  catch { toast.error(ko.files.missing) }
}
</script>

<template>
  <ul v-if="files.length" class="flex flex-wrap gap-2">
    <li v-for="f in files" :key="f.id" class="bg-muted/40 flex max-w-60 items-center gap-2 rounded-md border p-1 pr-2 text-xs">
      <button type="button" class="flex min-w-0 items-center gap-2 text-left" :title="f.name" @click="open(f)">
        <img v-if="thumbs[f.id]" :src="thumbs[f.id]" alt="" class="size-10 shrink-0 rounded object-cover">
        <FileIcon v-else class="text-muted-foreground size-5 shrink-0" />
        <span class="min-w-0">
          <span class="block truncate">{{ f.name }}</span>
          <span class="text-muted-foreground">{{ formatBytes(f.size) }}</span>
        </span>
      </button>
      <button v-if="removable" type="button" class="text-muted-foreground hover:text-foreground" :aria-label="ko.files.detach" @click="emit('remove', f.id)">
        <XIcon class="size-4" />
      </button>
    </li>
  </ul>
</template>
