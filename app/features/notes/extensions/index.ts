import type { Editor } from '@tiptap/core'
import type { LinkCardOptions } from './link-card'
import type { SlashCommandOptions } from './slash'
import { Color } from '@tiptap/extension-color'
import { Highlight } from '@tiptap/extension-highlight'
import { Mathematics } from '@tiptap/extension-mathematics'
import { TextStyle } from '@tiptap/extension-text-style'
import UniqueID from '@tiptap/extension-unique-id'
import { Placeholder } from '@tiptap/extensions'
import StarterKit from '@tiptap/starter-kit'
import { BLOCK_TYPES } from '../sync/serialize'
import { Callout, Quote, Video } from './blocks'
import { AppEmbed, PageLink, TodaySummary } from './link-card'
import { BlockKeymap, BulletItem, ItemLine, NumberedItem, TodoItem, Toggle } from './flat-list'
import { SlashCommand } from './slash'

export const newBlockId = () => crypto.randomUUID()

/** MATH-01 노트 수식: 누르면 편집(수정 가능할 때) */
export interface NoteMathOptions {
  onEdit?: (kind: 'inlineMath' | 'blockMath', latex: string, pos: number) => void
}

export function noteExtensions(opts: { placeholder?: string, slash?: Partial<SlashCommandOptions>, link?: Partial<LinkCardOptions>, math?: NoteMathOptions } = {}) {
  return [
    StarterKit.configure({
      bulletList: false,
      orderedList: false,
      listItem: false,
      listKeymap: false,
      blockquote: false,
      trailingNode: false,
      link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
    }),
    ItemLine,
    BulletItem,
    NumberedItem,
    TodoItem,
    Toggle,
    Quote,
    Callout,
    Video,
    ...[PageLink, AppEmbed, TodaySummary].map(n => n.configure(opts.link ?? {})),
    BlockKeymap,
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    Mathematics.configure({
      katexOptions: { throwOnError: false, strict: 'ignore' },
      inlineOptions: { onClick: (node, pos) => opts.math?.onEdit?.('inlineMath', node.attrs.latex, pos) },
      blockOptions: { onClick: (node, pos) => opts.math?.onEdit?.('blockMath', node.attrs.latex, pos) },
    }),
    ...(opts.placeholder ? [Placeholder.configure({ placeholder: ({ node }) => (node.type.name === 'paragraph' ? opts.placeholder! : '') })] : []),
    ...(opts.slash ? [SlashCommand.configure(opts.slash)] : []),
    UniqueID.configure({ types: BLOCK_TYPES, attributeName: 'id', generateID: newBlockId }),
  ]
}

/** 저장 전 안전장치: ID가 없거나 겹치는 블록에 새 ID를 준다 (실행 취소 기록에는 남기지 않음) */
export function ensureUniqueIds(editor: Editor): boolean {
  const types = new Set(BLOCK_TYPES)
  const seen = new Set<string>()
  const tr = editor.state.tr
  editor.state.doc.descendants((node, pos) => {
    if (!types.has(node.type.name)) return
    const id = node.attrs.id as string | null
    if (!id || seen.has(id)) tr.setNodeAttribute(pos, 'id', newBlockId())
    else seen.add(id)
  })
  if (!tr.docChanged) return false
  editor.view.dispatch(tr.setMeta('addToHistory', false))
  return true
}
