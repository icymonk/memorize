// `/` 블록 메뉴 (NOTE-01)
import type { Editor, Range } from '@tiptap/core'
import type { SuggestionOptions } from '@tiptap/suggestion'
import { Extension } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import Suggestion from '@tiptap/suggestion'
import { insertBlock, turnInto } from './commands'

export interface SlashItem {
  key: string
  keywords: string[]
  run: (editor: Editor) => boolean
}

/** 화면 이름은 locales의 notes.blocks[key] */
export const SLASH_ITEMS: SlashItem[] = [
  { key: 'paragraph', keywords: ['text', 'p', '텍스트', '문단'], run: e => turnInto(e, 'paragraph') },
  { key: 'heading1', keywords: ['h1', 'heading', '제목'], run: e => turnInto(e, 'heading', { level: 1 }) },
  { key: 'heading2', keywords: ['h2', 'heading', '제목'], run: e => turnInto(e, 'heading', { level: 2 }) },
  { key: 'heading3', keywords: ['h3', 'heading', '제목'], run: e => turnInto(e, 'heading', { level: 3 }) },
  { key: 'bulletItem', keywords: ['bullet', 'list', 'ul', '목록', '글머리'], run: e => turnInto(e, 'bulletItem') },
  { key: 'numberedItem', keywords: ['number', 'ordered', 'ol', '번호', '목록'], run: e => turnInto(e, 'numberedItem') },
  { key: 'todoItem', keywords: ['todo', 'check', 'task', '체크', '할 일'], run: e => turnInto(e, 'todoItem') },
  { key: 'toggle', keywords: ['toggle', '토글', '접기'], run: e => turnInto(e, 'toggle') },
  { key: 'blockquote', keywords: ['quote', '인용'], run: e => turnInto(e, 'blockquote') },
  { key: 'callout', keywords: ['callout', '강조', '상자'], run: e => turnInto(e, 'callout') },
  { key: 'codeBlock', keywords: ['code', '코드'], run: e => turnInto(e, 'codeBlock') },
  { key: 'horizontalRule', keywords: ['divider', 'hr', 'line', '구분선'], run: e => insertBlock(e, 'horizontalRule') },
  { key: 'video', keywords: ['youtube', 'video', '유튜브', '영상'], run: () => false },
  { key: 'quote', keywords: ['quote', 'phrase', '구절', '인용'], run: () => false },
]

export function filterSlash(query: string, labels: Record<string, string>, items = SLASH_ITEMS): SlashItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter(i => labels[i.key]?.toLowerCase().includes(q) || i.keywords.some(k => k.startsWith(q)))
}

export interface SlashCommandOptions {
  labels: Record<string, string>
  /** 메뉴 화면(Vue)은 BlockEditor가 넣어 준다 */
  render?: SuggestionOptions<SlashItem>['render']
  /** 유튜브처럼 입력이 더 필요한 항목 */
  onItem?: (key: string, editor: Editor) => boolean
  /** 이 페이지에서 쓸 수 없는 항목 (구절은 독후감에서만) */
  exclude?: string[]
}

export const slashPluginKey = new PluginKey('slashCommand')

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: 'slashCommand',
  addOptions: () => ({ labels: {} }),
  addProseMirrorPlugins() {
    return [Suggestion<SlashItem>({
      editor: this.editor,
      pluginKey: slashPluginKey,
      char: '/',
      items: ({ query }) => filterSlash(query, this.options.labels, SLASH_ITEMS.filter(i => !this.options.exclude?.includes(i.key))),
      allow: ({ state, range }) => state.doc.resolve(range.from).parent.type.name !== 'codeBlock',
      command: ({ editor, range, props }: { editor: Editor, range: Range, props: SlashItem }) => {
        editor.chain().focus().deleteRange(range).run()
        if (!this.options.onItem?.(props.key, editor)) props.run(editor)
      },
      render: this.options.render,
    })]
  },
})
