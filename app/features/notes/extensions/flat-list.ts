// 노션식 평평한 목록 블록: 첫 줄(itemLine) + 자식 블록 (docs/dev/editor.md 2.1절, spikes.md S2)
import type { NodeViewRendererProps } from '@tiptap/core'
import { Extension, InputRule, Node } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { indentBlock, itemToParagraph, outdentBlock, splitItem } from './commands'

export const ItemLine = Node.create({
  name: 'itemLine',
  content: 'inline*',
  parseHTML: () => [{ tag: 'div[data-item-line]' }],
  renderHTML: () => ['div', { 'data-item-line': '' }, 0],
})

/** 문단 맨 앞의 `- `, `1. `, `[] ` 를 목록 블록으로 바꾼다. 문단의 블록 ID는 유지 */
function listInputRule(find: RegExp, type: string, attrs: (m: RegExpMatchArray) => Record<string, unknown> = () => ({})) {
  return new InputRule({
    find,
    handler: ({ state, range, match }) => {
      const $from = state.doc.resolve(range.from)
      if ($from.parent.type.name !== 'paragraph') return null
      const pos = $from.before()
      const tr = state.tr.delete(range.from, range.to)
      const para = tr.doc.nodeAt(pos)!
      const node = state.schema.nodes[type]!.create({ ...attrs(match), id: para.attrs.id }, state.schema.nodes.itemLine!.create(null, para.content))
      tr.replaceWith(pos, pos + para.nodeSize, node)
      tr.setSelection(TextSelection.create(tr.doc, pos + 2))
    },
  })
}

type ViewSetup = (p: NodeViewRendererProps, dom: HTMLElement) => { update: (n: NodeViewRendererProps['node']) => void }

function listItem(name: string, extraAttrs: Record<string, unknown>, rule: InputRule | null, view?: ViewSetup) {
  return Node.create({
    name,
    group: 'block',
    content: 'itemLine block*',
    defining: true,
    addKeyboardShortcuts() {
      return { Enter: () => splitItem(this.editor, this.name) }
    },
    addAttributes: () => Object.fromEntries(Object.entries(extraAttrs).map(([k, v]) => [k, {
      default: v,
      parseHTML: (el: HTMLElement) => el.dataset[k] === undefined ? v : el.dataset[k] === 'true',
      renderHTML: (a: Record<string, unknown>) => ({ [`data-${k}`]: String(a[k]) }),
    }])),
    addInputRules: () => (rule ? [rule] : []),
    parseHTML: () => [{ tag: `div[data-type="${name}"]` }],
    renderHTML: ({ HTMLAttributes }) => ['div', { ...HTMLAttributes, 'data-type': name }, 0],
    ...(view
      ? {
          addNodeView: () => (p: NodeViewRendererProps) => {
            const dom = document.createElement('div')
            dom.dataset.type = name
            const content = document.createElement('div')
            content.dataset.content = ''
            const { update } = view(p, dom)
            dom.append(content)
            const sync = (n: NodeViewRendererProps['node']) => { dom.dataset.id = String(n.attrs.id ?? ''); update(n) }
            sync(p.node)
            return {
              dom,
              contentDOM: content,
              update: (n) => { if (n.type !== p.node.type) return false; sync(n); return true },
              stopEvent: e => !content.contains(e.target as globalThis.Node),
              ignoreMutation: m => !content.contains(m.target),
            }
          },
        }
      : {}),
  })
}

function setAttr(p: NodeViewRendererProps, key: string, value: unknown) {
  const pos = typeof p.getPos === 'function' ? p.getPos() : undefined
  if (pos === undefined) return
  p.editor.view.dispatch(p.editor.state.tr.setNodeAttribute(pos, key, value))
}

export const BulletItem = listItem('bulletItem', {}, listInputRule(/^\s*[-*]\s$/, 'bulletItem'))
export const NumberedItem = listItem('numberedItem', {}, listInputRule(/^\s*\d+\.\s$/, 'numberedItem'))
export const TodoItem = listItem('todoItem', { checked: false }, listInputRule(/^\s*\[( |x)?\]\s$/i, 'todoItem', m => ({ checked: m[1]?.toLowerCase() === 'x' })), (p, dom) => {
  const box = document.createElement('input')
  box.type = 'checkbox'
  box.contentEditable = 'false'
  box.addEventListener('change', () => {
    if (p.editor.isEditable) setAttr(p, 'checked', box.checked)
    else box.checked = !box.checked
  })
  dom.append(box)
  return { update: (n) => { box.checked = !!n.attrs.checked; dom.dataset.checked = String(!!n.attrs.checked) } }
})
export const Toggle = listItem('toggle', { open: true }, null, (p, dom) => {
  const button = document.createElement('button')
  button.type = 'button'
  button.contentEditable = 'false'
  button.dataset.toggle = ''
  button.addEventListener('click', () => {
    const open = dom.dataset.open !== 'true'
    // 읽기 전용이면 내 화면에서만 접고 편다
    if (p.editor.isEditable) setAttr(p, 'open', open)
    else dom.dataset.open = String(open)
  })
  dom.append(button)
  return { update: (n) => { dom.dataset.open = String(!!n.attrs.open) } }
})

export const BlockKeymap = Extension.create({
  name: 'blockKeymap',
  addKeyboardShortcuts() {
    return {
      'Tab': () => indentBlock(this.editor) || true,
      'Shift-Tab': () => outdentBlock(this.editor) || true,
      'Backspace': () => {
        const { $from, empty } = this.editor.state.selection
        return empty && $from.parent.type.name === 'itemLine' && $from.parentOffset === 0 && itemToParagraph(this.editor)
      },
    }
  },
})
