// 노션식 평평한 목록 블록 + 블록 ID (docs/dev/editor.md 2.1절, spikes.md S2)
import type { Editor } from '@tiptap/core'
import { Node } from '@tiptap/core'
import UniqueID from '@tiptap/extension-unique-id'
import StarterKit from '@tiptap/starter-kit'
import { BLOCK_TYPES } from '../sync/serialize'

export const ItemLine = Node.create({
  name: 'itemLine',
  content: 'inline*',
  parseHTML: () => [{ tag: 'div[data-item-line]' }],
  renderHTML: () => ['div', { 'data-item-line': '' }, 0],
})

function listItem(name: string, extraAttrs: Record<string, unknown> = {}) {
  return Node.create({
    name,
    group: 'block',
    content: 'itemLine block*',
    defining: true,
    addKeyboardShortcuts() {
      return { Enter: () => this.editor.commands.splitListItem(this.name) }
    },
    addAttributes: () => Object.fromEntries(Object.entries(extraAttrs).map(([k, v]) => [k, { default: v }])),
    parseHTML: () => [{ tag: `div[data-type="${name}"]` }],
    renderHTML: ({ HTMLAttributes }) => ['div', { ...HTMLAttributes, 'data-type': name }, 0],
  })
}

export const BulletItem = listItem('bulletItem')
export const TodoItem = listItem('todoItem', { checked: false })
export const Toggle = listItem('toggle', { open: true })

export const newBlockId = () => crypto.randomUUID()

export function noteExtensions() {
  return [
    StarterKit.configure({ bulletList: false, orderedList: false, listItem: false, listKeymap: false, link: false, trailingNode: false }),
    ItemLine,
    BulletItem,
    TodoItem,
    Toggle,
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
