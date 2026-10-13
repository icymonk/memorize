<script setup lang="ts">
import type { Editor as CoreEditor } from '@tiptap/core'
import type { SuggestionOptions } from '@tiptap/suggestion'
import type { SlashItem } from '../extensions/slash'
import type { SaveStatus } from '../sync/writer'
import { computePosition, flip, offset, shift } from '@floating-ui/dom'
import { BoldIcon, CodeIcon, GripVerticalIcon, HighlighterIcon, ItalicIcon, LinkIcon, StrikethroughIcon, UnderlineIcon } from '@lucide/vue'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import { Editor, EditorContent, VueRenderer } from '@tiptap/vue-3'
import { BubbleMenu } from '@tiptap/vue-3/menus'
import { onClickOutside, useDebounceFn, useEventListener, useOnline } from '@vueuse/core'
import { toast } from 'vue-sonner'
import { youtubeEmbed } from '../extensions/blocks'
import { deleteBlock, duplicateBlock, findBlockPos, insertBlock, moveBlock } from '../extensions/commands'
import { ensureUniqueIds, noteExtensions } from '../extensions/index'
import { SLASH_ITEMS } from '../extensions/slash'
import { loadBlocks, watchBlocks } from '../services/pages'
import { diffBlocks, savedFrom } from '../sync/diff'
import { fromBlocks, toBlocks } from '../sync/serialize'
import { createSaveQueue, firestoreCommitter } from '../sync/writer'
import { cn } from '~/lib/utils'
import { ko } from '~/locales/ko'
import QuotePicker from './QuotePicker.vue'
import SlashMenu from './SlashMenu.vue'

/** 블록 편집기: 불러오기 → 편집 → 0.8초 뒤 바뀐 블록만 저장 (docs/dev/editor.md 3·4절) */
const props = defineProps<{ spaceId: string, pageId: string, editable: boolean, bookKey?: string }>()
const emit = defineEmits<{ status: [SaveStatus], loaded: [blockCount: number], error: [unknown], headings: [{ id: string, level: number, text: string }[]] }>()
const t = ko.notes

const { $firestore } = useNuxtApp()
const auth = useAuthStore()
const editor = shallowRef<Editor>()
const online = useOnline()
const wrapper = ref<HTMLElement>()
let queue: ReturnType<typeof createSaveQueue> | undefined
let unwatch: (() => void) | undefined

function slashRender(): ReturnType<NonNullable<SuggestionOptions<SlashItem>['render']>> {
  let menu: VueRenderer | undefined
  let el: HTMLElement | undefined
  const place = (rect: (() => DOMRect | null) | null | undefined) => {
    if (!el || !rect) return
    const virtual = { getBoundingClientRect: () => rect() ?? new DOMRect() }
    computePosition(virtual, el, { placement: 'bottom-start', strategy: 'fixed', middleware: [offset(4), flip(), shift({ padding: 8 })] })
      .then(({ x, y }) => { Object.assign(el!.style, { left: `${x}px`, top: `${y}px` }) })
  }
  return {
    onStart: (p) => {
      menu = new VueRenderer(SlashMenu, { props: p, editor: p.editor })
      el = document.createElement('div')
      Object.assign(el.style, { position: 'fixed', zIndex: '50' })
      el.append(menu.element!)
      document.body.append(el)
      place(p.clientRect)
    },
    onUpdate: (p) => { menu?.updateProps(p); place(p.clientRect) },
    onKeyDown: ({ event }) => {
      if (event.key === 'Escape') { el?.remove(); return true }
      return (menu?.ref as { onKeyDown?: (e: KeyboardEvent) => boolean } | undefined)?.onKeyDown?.(event) ?? false
    },
    onExit: () => { el?.remove(); menu?.destroy(); menu = el = undefined },
  }
}

/** REV-05: 독후감에서 `/구절` → 이 책의 내 구절을 인용 블록으로 */
const quoteOpen = ref(false)
let quoteEditor: CoreEditor | undefined
function insertQuote(text: string) {
  quoteEditor?.chain().focus().insertContent([{ type: 'blockquote', content: [{ type: 'text', text }] }, { type: 'paragraph' }]).run()
}

function onSlashItem(key: string, e: CoreEditor) {
  if (key === 'quote') {
    quoteEditor = e
    quoteOpen.value = true
    return true
  }
  if (key !== 'video') return false
  void promptDialog(t.videoPrompt).then((raw) => {
    if (raw === null) return
    const src = youtubeEmbed(raw)
    if (src) insertBlock(e, 'video', { src })
    else toast.error(t.videoInvalid)
  })
  return true
}

onMounted(async () => {
  try {
    const blocks = await loadBlocks($firestore, props.spaceId, props.pageId)
    emit('loaded', blocks.length)
    const e = new Editor({
      extensions: noteExtensions({ placeholder: t.placeholder, slash: { labels: t.blocks, render: slashRender, onItem: onSlashItem, exclude: props.bookKey ? [] : ['quote'] } }),
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
    // NOTE-23 목차: 제목 블록에서 만든다
    const emitHeadings = () => {
      const list: { id: string, level: number, text: string }[] = []
      e.state.doc.descendants((n) => {
        if (n.type.name === 'heading' && n.attrs.id) list.push({ id: n.attrs.id, level: n.attrs.level, text: n.textContent })
      })
      emit('headings', list)
    }
    const headingsLater = useDebounceFn(emitHeadings, 300)
    e.on('update', () => {
      headingsLater()
      if (ensureUniqueIds(e)) return
      queue?.schedule()
    })
    editor.value = e
    nextTick(emitHeadings)
    // 편집 잠금 때문에 동시에 고치는 사람은 없다. 내가 쓰는 중이 아닐 때만 남이 고친 내용으로 바꾼다
    unwatch = watchBlocks($firestore, props.spaceId, props.pageId, (remote, local) => {
      if (local || (props.editable && queue?.busy)) return
      if (!diffBlocks(savedFrom(remote), toBlocks(e.getJSON())).ops.length) return
      e.commands.setContent(fromBlocks(remote), { emitUpdate: false })
      queue?.rebase(savedFrom(remote))
      emit('loaded', remote.length)
      emitHeadings()
    }, () => {})
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
  unwatch?.()
  flush()
  queue?.dispose()
  editor.value?.destroy()
})

// 글자 꾸미기 (NOTE-09)
const COLORS = ['#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#2563eb', '#7c3aed', '#db2777', '#6b7280']
const HIGHLIGHTS = ['#fef08a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#fed7aa']
const chain = () => editor.value!.chain().focus()
const marks = computed(() => [
  { key: 'bold', icon: BoldIcon, run: () => chain().toggleBold().run() },
  { key: 'italic', icon: ItalicIcon, run: () => chain().toggleItalic().run() },
  { key: 'underline', icon: UnderlineIcon, run: () => chain().toggleUnderline().run() },
  { key: 'strike', icon: StrikethroughIcon, run: () => chain().toggleStrike().run() },
  { key: 'code', icon: CodeIcon, run: () => chain().toggleCode().run() },
] as const)
async function setLink() {
  const prev = editor.value!.getAttributes('link').href as string | undefined
  const href = await promptDialog(t.format.linkPrompt, prev ?? 'https://')
  if (href === null) return
  if (!href.trim()) chain().extendMarkRange('link').unsetLink().run()
  else chain().extendMarkRange('link').setLink({ href: href.trim() }).run()
}
const bubbleOptions = { placement: 'top' as const, offset: 6 }
const showBubble = ({ editor: e, from, to }: { editor: CoreEditor, from: number, to: number }) =>
  e.isEditable && from !== to && !(e.state.selection instanceof NodeSelection) && !e.isActive('codeBlock')

// 끌기 손잡이 + 블록 메뉴 (NOTE-01)
const hovered = ref<{ id: string, top: number, left: number } | null>(null)
const menuOpen = ref(false)
const menuRef = ref<HTMLElement>()
onClickOutside(menuRef, () => { menuOpen.value = false })
function onMouseMove(ev: MouseEvent) {
  if (!props.editable || menuOpen.value || !wrapper.value) return
  const el = (ev.target as HTMLElement).closest?.('.note-editor [data-id]') as HTMLElement | null
  if (!el) return
  const box = wrapper.value.getBoundingClientRect()
  const r = el.getBoundingClientRect()
  hovered.value = { id: el.dataset.id!, top: r.top - box.top + 2, left: r.left - box.left - 22 }
}
const hoveredPos = () => (hovered.value && editor.value ? findBlockPos(editor.value.state.doc, hovered.value.id) : null)
function onDragStart(ev: DragEvent) {
  const e = editor.value
  const pos = hoveredPos()
  if (!e || pos === null || !ev.dataTransfer) return
  const view = e.view
  view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)))
  const dom = view.nodeDOM(pos) as HTMLElement | null
  ev.dataTransfer.effectAllowed = 'move'
  ev.dataTransfer.setData('text/plain', '')
  if (dom) ev.dataTransfer.setDragImage(dom, 0, 0)
  ;(view as unknown as { dragging: unknown }).dragging = { slice: view.state.selection.content(), move: true }
}
function blockAction(action: 'up' | 'down' | 'duplicate' | 'delete') {
  const e = editor.value
  const pos = hoveredPos()
  menuOpen.value = false
  if (!e || pos === null) return
  if (action === 'up') moveBlock(e, pos, -1)
  else if (action === 'down') moveBlock(e, pos, 1)
  else if (action === 'duplicate') duplicateBlock(e, pos)
  else deleteBlock(e, pos)
  e.commands.focus()
}
function turnHovered(item: SlashItem) {
  const e = editor.value
  const pos = hoveredPos()
  menuOpen.value = false
  if (!e || pos === null) return
  e.view.dispatch(e.state.tr.setSelection(TextSelection.near(e.state.doc.resolve(pos + 1))))
  if (!onSlashItem(item.key, e)) item.run(e)
  e.commands.focus()
}
const turnItems = SLASH_ITEMS.filter(i => !['horizontalRule', 'video', 'quote'].includes(i.key))

defineExpose({ flush, focus: () => editor.value?.commands.focus('start') })
</script>

<template>
  <div ref="wrapper" class="relative pl-6" @mousemove="onMouseMove" @mouseleave="menuOpen || (hovered = null)">
    <template v-if="editor">
      <BubbleMenu :editor="editor" :options="bubbleOptions" :should-show="showBubble">
        <div class="bg-popover flex items-center gap-0.5 rounded-md border p-1 shadow-md">
          <button
            v-for="m in marks"
            :key="m.key"
            type="button"
            :title="t.format[m.key]"
            :class="cn('hover:bg-accent rounded p-1.5', editor.isActive(m.key) && 'bg-accent')"
            @click="m.run()"
          >
            <component :is="m.icon" class="size-4" />
          </button>
          <button type="button" :title="t.format.link" :class="cn('hover:bg-accent rounded p-1.5', editor.isActive('link') && 'bg-accent')" @click="setLink">
            <LinkIcon class="size-4" />
          </button>
          <span class="bg-border mx-1 h-5 w-px" />
          <span class="flex items-center gap-0.5" :title="t.format.color">
            <button v-for="c in COLORS" :key="c" type="button" class="size-4 rounded-full border" :style="{ background: c }" :aria-label="`${t.format.color} ${c}`" @click="chain().setColor(c).run()" />
            <button type="button" class="text-muted-foreground px-1 text-xs" @click="chain().unsetColor().unsetHighlight().run()">{{ t.format.reset }}</button>
          </span>
          <span class="bg-border mx-1 h-5 w-px" />
          <HighlighterIcon class="text-muted-foreground size-4" :aria-label="t.format.highlight" />
          <button v-for="c in HIGHLIGHTS" :key="c" type="button" class="size-4 rounded-sm border" :style="{ background: c }" :aria-label="`${t.format.highlight} ${c}`" @click="chain().setHighlight({ color: c }).run()" />
        </div>
      </BubbleMenu>

      <div v-if="editable && hovered" class="absolute z-10" :style="{ top: `${hovered.top}px`, left: `${hovered.left}px` }">
        <button
          type="button"
          draggable="true"
          :title="t.handle.drag"
          class="text-muted-foreground hover:bg-accent flex size-5 cursor-grab items-center justify-center rounded"
          @dragstart="onDragStart"
          @click="menuOpen = !menuOpen"
        >
          <GripVerticalIcon class="size-4" />
        </button>
        <div v-if="menuOpen" ref="menuRef" class="bg-popover absolute top-6 left-0 z-20 flex w-44 flex-col rounded-md border p-1 text-sm shadow-md">
          <button type="button" class="hover:bg-accent rounded-sm px-2 py-1.5 text-left" @click="blockAction('up')">{{ t.handle.moveUp }}</button>
          <button type="button" class="hover:bg-accent rounded-sm px-2 py-1.5 text-left" @click="blockAction('down')">{{ t.handle.moveDown }}</button>
          <button type="button" class="hover:bg-accent rounded-sm px-2 py-1.5 text-left" @click="blockAction('duplicate')">{{ t.handle.duplicate }}</button>
          <button type="button" class="hover:bg-accent text-destructive rounded-sm px-2 py-1.5 text-left" @click="blockAction('delete')">{{ t.handle.delete }}</button>
          <p class="text-muted-foreground mt-1 border-t px-2 pt-1.5 pb-1 text-xs">{{ t.handle.turnInto }}</p>
          <button v-for="item in turnItems" :key="item.key" type="button" class="hover:bg-accent rounded-sm px-2 py-1 text-left" @click="turnHovered(item)">
            {{ t.blocks[item.key] }}
          </button>
        </div>
      </div>

      <QuotePicker v-if="bookKey" v-model:open="quoteOpen" :sid="spaceId" :book-key="bookKey" @pick="insertQuote" />

      <EditorContent :editor="editor" />
    </template>
    <div v-else class="flex flex-col gap-3 py-2">
      <Skeleton class="h-5 w-3/4" />
      <Skeleton class="h-5 w-1/2" />
      <Skeleton class="h-5 w-2/3" />
    </div>
  </div>
</template>

<style>
.note-editor { min-height: 12rem; line-height: 1.7; }
.note-editor > * + * { margin-top: 0.25rem; }
.note-editor h1 { font-size: 1.875rem; font-weight: 700; margin-top: 1.25rem; }
.note-editor h2 { font-size: 1.5rem; font-weight: 600; margin-top: 1rem; }
.note-editor h3 { font-size: 1.25rem; font-weight: 600; margin-top: 0.75rem; }
.note-editor blockquote { border-left: 3px solid var(--border); padding-left: 0.875rem; color: var(--muted-foreground); }
.note-editor [data-callout] { display: flex; gap: 0.5rem; background: var(--muted); border-radius: 0.375rem; padding: 0.625rem 0.875rem; }
.note-editor [data-callout]::before { content: attr(data-emoji); }
.note-editor pre { background: var(--muted); border-radius: 0.375rem; padding: 0.75rem 1rem; font-family: ui-monospace, monospace; font-size: 0.875rem; }
.note-editor code { background: var(--muted); border-radius: 0.25rem; padding: 0 0.25rem; font-size: 0.875em; }
.note-editor a { color: var(--primary); text-decoration: underline; }
.note-editor hr { border-color: var(--border); margin: 1rem 0; }
.note-editor hr.ProseMirror-selectednode, .note-editor .ProseMirror-selectednode { outline: 2px solid var(--ring); border-radius: 0.25rem; }
.note-editor [data-video] iframe { width: 100%; aspect-ratio: 16 / 9; border: 0; border-radius: 0.375rem; }
.note-editor [data-type] { position: relative; padding-left: 1.5rem; }
.note-editor [data-type="bulletItem"]::before { content: '•'; position: absolute; left: 0.5rem; }
.note-editor [data-type="numberedItem"] { counter-increment: note-num; }
.note-editor :not([data-type="numberedItem"]) + [data-type="numberedItem"], .note-editor [data-type="numberedItem"]:first-child { counter-reset: note-num; counter-increment: note-num; }
.note-editor [data-type="numberedItem"]::before { content: counter(note-num) '.'; position: absolute; left: 0.125rem; font-variant-numeric: tabular-nums; }
.note-editor [data-type="todoItem"] > input { position: absolute; left: 0.25rem; top: 0.45rem; }
.note-editor [data-type="todoItem"][data-checked="true"] > [data-content] > [data-item-line] { text-decoration: line-through; color: var(--muted-foreground); }
.note-editor [data-toggle] { position: absolute; left: 0.25rem; top: 0.2rem; width: 1rem; transition: transform 0.15s; }
.note-editor [data-toggle]::before { content: '▸'; }
.note-editor [data-type="toggle"][data-open="true"] > [data-toggle] { transform: rotate(90deg); }
.note-editor [data-type="toggle"][data-open="false"] > [data-content] > :not(:first-child) { display: none; }
.note-editor p.is-empty::before, .note-editor .is-empty[data-placeholder]::before { content: attr(data-placeholder); color: var(--muted-foreground); opacity: 0.6; float: left; height: 0; pointer-events: none; }
</style>
