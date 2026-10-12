<script setup lang="ts">
import type { SaveStatus } from '../sync/writer'
import { Editor, EditorContent } from '@tiptap/vue-3'
import { useEventListener, useOnline } from '@vueuse/core'
import { ensureUniqueIds, noteExtensions } from '../extensions/flat-list'
import { savedFrom } from '../sync/diff'
import { fromBlocks, toBlocks } from '../sync/serialize'
import { createSaveQueue, firestoreCommitter } from '../sync/writer'
import { loadBlocks } from '../services/pages'

/** 블록 편집기: 불러오기 → 편집 → 0.8초 뒤 바뀐 블록만 저장 (docs/dev/editor.md 3·4절) */
const props = defineProps<{ spaceId: string, pageId: string, editable: boolean }>()
const emit = defineEmits<{ status: [SaveStatus], loaded: [blockCount: number], error: [unknown] }>()

const { $firestore } = useNuxtApp()
const auth = useAuthStore()
const editor = shallowRef<Editor>()
const online = useOnline()
let queue: ReturnType<typeof createSaveQueue> | undefined

onMounted(async () => {
  try {
    const blocks = await loadBlocks($firestore, props.spaceId, props.pageId)
    emit('loaded', blocks.length)
    const e = new Editor({
      extensions: noteExtensions(),
      content: fromBlocks(blocks),
      editable: props.editable,
      editorProps: { attributes: { class: 'note-editor focus:outline-none' } },
    })
    queue = createSaveQueue({
      saved: savedFrom(blocks),
      getBlocks: () => toBlocks(e.getJSON()),
      commit: firestoreCommitter($firestore, props.spaceId, props.pageId, auth.user!.uid),
      onStatus: s => emit('status', s),
      online: () => online.value,
    })
    e.on('update', () => {
      if (ensureUniqueIds(e)) return
      queue?.schedule()
    })
    editor.value = e
  }
  catch (error) {
    emit('error', error)
  }
})

watch(online, () => queue?.refresh())
watch(() => props.editable, v => editor.value?.setEditable(v))

function flush() { queue?.flush() }
useEventListener(document, 'visibilitychange', () => { if (document.visibilityState === 'hidden') flush() })
useEventListener(window, 'beforeunload', (e: BeforeUnloadEvent) => {
  flush()
  if (queue?.busy) e.preventDefault()
})
onBeforeUnmount(() => {
  flush()
  queue?.dispose()
  editor.value?.destroy()
})

defineExpose({ flush, focus: () => editor.value?.commands.focus('start') })
</script>

<template>
  <EditorContent v-if="editor" :editor="editor" />
  <div v-else class="flex flex-col gap-3 py-2">
    <Skeleton class="h-5 w-3/4" />
    <Skeleton class="h-5 w-1/2" />
    <Skeleton class="h-5 w-2/3" />
  </div>
</template>

<style>
.note-editor { min-height: 12rem; line-height: 1.7; }
.note-editor > * + * { margin-top: 0.25rem; }
.note-editor h1 { font-size: 1.875rem; font-weight: 700; margin-top: 1.25rem; }
.note-editor h2 { font-size: 1.5rem; font-weight: 600; margin-top: 1rem; }
.note-editor h3 { font-size: 1.25rem; font-weight: 600; margin-top: 0.75rem; }
.note-editor blockquote { border-left: 3px solid var(--border); padding-left: 0.875rem; color: var(--muted-foreground); }
.note-editor pre { background: var(--muted); border-radius: 0.375rem; padding: 0.75rem 1rem; font-family: ui-monospace, monospace; font-size: 0.875rem; }
.note-editor code { background: var(--muted); border-radius: 0.25rem; padding: 0 0.25rem; font-size: 0.875em; }
.note-editor hr { border-color: var(--border); margin: 1rem 0; }
.note-editor [data-type] { position: relative; padding-left: 1.5rem; }
.note-editor [data-type] > [data-type], .note-editor [data-type] > p { margin-left: 0; }
.note-editor [data-type="bulletItem"]::before { content: '•'; position: absolute; left: 0.5rem; }
.note-editor [data-type="todoItem"]::before { content: '☐'; position: absolute; left: 0.25rem; }
.note-editor [data-type="todoItem"][checked="true"]::before { content: '☑'; }
.note-editor [data-type="toggle"]::before { content: '▸'; position: absolute; left: 0.375rem; }
</style>
