<script setup lang="ts">
import type { Page } from '../services/pages'
import { PlusIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { errorMessage } from '~/lib/errors'
import { ko } from '~/locales/ko'
import PageTreeItem from './PageTreeItem.vue'

/** NOTE-20: 사이드바의 한 갈래 (공유 페이지 / 내 페이지). 갈래 제목에 놓으면 맨 위로 옮긴다 */
const props = defineProps<{ sid: string, root: Page['root'], label: string, canCreate: boolean }>()
const notes = useNotesStore()
const top = computed(() => notes.childrenOf(null, props.root))
const over = ref(false)

async function add() {
  try {
    const id = await notes.create(props.root)
    await navigateTo(`/s/${props.sid}/notes/${id}`)
  }
  catch (error) { toast.error(errorMessage(error) ?? ko.errors.unknown) }
}
async function onDrop(e: DragEvent) {
  over.value = false
  const id = e.dataTransfer?.getData('application/x-memorize-page')
  const page = id ? notes.byId.get(id) : null
  if (!page || page.root !== props.root) return
  try { await notes.move(page.id, null, 'inside', props.root) }
  catch (error) { toast.error(errorMessage(error) ?? ko.notes.moveFailed) }
}
</script>

<template>
  <SidebarGroup class="group-data-[collapsible=icon]:hidden">
    <SidebarGroupLabel
      :class="over && 'ring-primary ring-2'"
      @dragover.prevent="over = true"
      @dragleave="over = false"
      @drop.prevent="onDrop"
    >
      {{ label }}
    </SidebarGroupLabel>
    <SidebarGroupAction v-if="canCreate" :title="ko.notes.addPage" @click="add">
      <PlusIcon />
    </SidebarGroupAction>
    <SidebarGroupContent>
      <ul class="flex flex-col">
        <PageTreeItem v-for="p in top" :key="p.id" :page="p" :depth="0" :sid="sid" />
      </ul>
      <p v-if="notes.loaded && !top.length" class="text-muted-foreground px-2 py-1 text-xs">
        {{ ko.notes.empty }}
      </p>
    </SidebarGroupContent>
  </SidebarGroup>
</template>
