// S2 spike: Notion-style flat list blocks (indent = child blocks) + UniqueID + block (de)serialization.
import { Node, type JSONContent } from '@tiptap/core'
import UniqueID from '@tiptap/extension-unique-id'
import StarterKit from '@tiptap/starter-kit'

export const BLOCK_TYPES = ['paragraph', 'heading', 'blockquote', 'codeBlock', 'horizontalRule', 'bulletItem', 'todoItem', 'toggle']
const LIST_TYPES = new Set(['bulletItem', 'todoItem', 'toggle'])

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

export function extensions(generateID: () => string = () => crypto.randomUUID()) {
  return [
    StarterKit.configure({ bulletList: false, orderedList: false, listItem: false, listKeymap: false, link: false, trailingNode: false }),
    ItemLine, BulletItem, TodoItem, Toggle,
    UniqueID.configure({ types: BLOCK_TYPES, attributeName: 'id', generateID }),
  ]
}

export interface StoredBlock {
  id: string
  type: string
  parentBlockId: string | null
  order: string
  attrs: Record<string, unknown>
  content: JSONContent[]
}

const orderKey = (i: number) => `a${String(i).padStart(4, '0')}`

export function toBlocks(doc: JSONContent): StoredBlock[] {
  const out: StoredBlock[] = []
  const walk = (nodes: JSONContent[], parent: string | null) => {
    nodes.forEach((node, i) => {
      const { id, ...attrs } = (node.attrs ?? {}) as Record<string, unknown>
      const isList = LIST_TYPES.has(node.type!)
      const [line, ...children] = isList ? node.content ?? [] : [node]
      out.push({
        id: id as string,
        type: node.type!,
        parentBlockId: parent,
        order: orderKey(i),
        attrs,
        content: (isList ? line?.content : node.content) ?? [],
      })
      if (isList) walk(children, id as string)
    })
  }
  walk(doc.content ?? [], null)
  return out
}

export function fromBlocks(blocks: StoredBlock[]): JSONContent {
  const byParent = new Map<string | null, StoredBlock[]>()
  for (const b of blocks) byParent.set(b.parentBlockId, [...(byParent.get(b.parentBlockId) ?? []), b])
  const build = (parent: string | null): JSONContent[] =>
    (byParent.get(parent) ?? []).sort((a, b) => a.order.localeCompare(b.order)).map((b) => {
      const attrs = { ...b.attrs, id: b.id }
      if (!LIST_TYPES.has(b.type)) return { type: b.type, attrs, ...(b.content.length ? { content: b.content } : {}) }
      const line: JSONContent = { type: 'itemLine', ...(b.content.length ? { content: b.content } : {}) }
      return { type: b.type, attrs, content: [line, ...build(b.id)] }
    })
  return { type: 'doc', content: build(null) }
}
