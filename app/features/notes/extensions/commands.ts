// 블록 단위 편집 명령: 들여쓰기·내어쓰기, 목록 나누기, 블록 바꾸기·옮기기 (NOTE-01·03)
import type { Editor, JSONContent } from '@tiptap/core'
import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'
import { Fragment } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import { BLOCK_TYPES, LIST_TYPES } from '../sync/serialize'

const blockTypes = new Set(BLOCK_TYPES)
const isList = (n: PMNode) => LIST_TYPES.has(n.type.name)
const childrenOf = (item: PMNode) => {
  const kids: PMNode[] = []
  item.forEach((c, _o, i) => { if (i > 0) kids.push(c) })
  return kids
}

/** 커서가 있는 블록의 깊이 (목록 블록은 첫 줄 itemLine의 부모). 없으면 -1 */
export function blockDepth($pos: ResolvedPos): number {
  for (let d = $pos.depth; d > 0; d--) if (blockTypes.has($pos.node(d).type.name)) return d
  return -1
}

function finish(editor: Editor, tr: Transaction, pos: number) {
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.max(0, Math.min(pos, tr.doc.content.size)))))
  editor.view.dispatch(tr.scrollIntoView())
  return true
}

/** Tab: 앞 목록 블록의 마지막 자식으로 넣는다 */
export function indentBlock(editor: Editor): boolean {
  const { state } = editor
  const { $from, from } = state.selection
  const d = blockDepth($from)
  if (d < 1) return false
  const index = $from.index(d - 1)
  if (index === 0) return false
  const prev = $from.node(d - 1).child(index - 1)
  if (!isList(prev)) return false
  const pos = $from.before(d)
  const node = $from.node(d)
  const tr = state.tr.delete(pos, pos + node.nodeSize).insert(pos - 1, node)
  return finish(editor, tr, from - 1)
}

/** Shift+Tab: 부모 목록 블록 바로 뒤로 꺼낸다. 뒤따르던 형제는 꺼낸 목록 블록의 자식이 된다 */
export function outdentBlock(editor: Editor): boolean {
  const { state } = editor
  const { $from, from } = state.selection
  const d = blockDepth($from)
  if (d < 2) return false
  const list = $from.node(d - 1)
  if (!isList(list)) return false
  const node = $from.node(d)
  const i = $from.index(d - 1)
  const kids: PMNode[] = []
  list.forEach(c => kids.push(c))
  const before = kids.slice(0, i)
  const after = kids.slice(i + 1)
  const replacement = isList(node)
    ? [list.copy(Fragment.from(before)), node.copy(node.content.append(Fragment.from(after)))]
    : [list.copy(Fragment.from([...before, ...after])), node]
  const listPos = $from.before(d - 1)
  const offset = listPos + replacement[0]!.nodeSize - $from.before(d)
  const tr = state.tr.replaceWith(listPos, listPos + list.nodeSize, replacement)
  return finish(editor, tr, from + offset)
}

/** 목록 블록을 문단으로 바꾸고 자식은 그 뒤로 꺼낸다 (빈 줄 Enter, 줄 맨 앞 Backspace) */
export function itemToParagraph(editor: Editor): boolean {
  const { state } = editor
  const { $from } = state.selection
  if ($from.parent.type.name !== 'itemLine') return false
  const item = $from.node(-1)
  const pos = $from.before(-1)
  const para = state.schema.nodes.paragraph!.create({ id: item.attrs.id }, $from.parent.content)
  const tr = state.tr.replaceWith(pos, pos + item.nodeSize, [para, ...childrenOf(item)])
  return finish(editor, tr, pos + 1 + $from.parentOffset)
}

/** Enter: 커서 뒤 글자로 같은 종류의 새 항목을 만든다. 펼친 자식이 있으면 첫 자식으로, 없으면 바로 뒤 형제로 */
export function splitItem(editor: Editor, name: string): boolean {
  const { state } = editor
  const { $from, empty } = state.selection
  if (!empty || $from.parent.type.name !== 'itemLine') return false
  const item = $from.node(-1)
  if (item.type.name !== name) return false
  if ($from.parent.content.size === 0) {
    const d = $from.depth - 1
    return (d >= 2 && isList($from.node(d - 1)) && outdentBlock(editor)) || itemToParagraph(editor)
  }
  const itemPos = $from.before(-1)
  const after = $from.parent.content.cut($from.parentOffset)
  const tr = state.tr.delete($from.pos, $from.end())
  const updated = tr.doc.nodeAt(itemPos)!
  const open = name !== 'toggle' || updated.attrs.open
  const at = updated.childCount > 1 && open ? itemPos + 1 + updated.child(0).nodeSize : itemPos + updated.nodeSize
  tr.insert(at, item.type.create(null, state.schema.nodes.itemLine!.create(null, after)))
  return finish(editor, tr, at + 2)
}

/** 지금 블록을 다른 종류로 바꾼다. 블록 ID와 글자는 그대로 둔다 */
export function turnInto(editor: Editor, type: string, attrs: Record<string, unknown> = {}): boolean {
  const { state } = editor
  const { schema } = state
  const { $from } = state.selection
  const d = blockDepth($from)
  const target = schema.nodes[type]
  if (d < 1 || !target) return false
  const node = $from.node(d)
  const pos = $from.before(d)
  const inline = isList(node) ? node.child(0).content : node.isTextblock ? node.content : Fragment.empty
  const caret = $from.parent.isTextblock ? $from.parentOffset : 0
  const kids = isList(node) ? childrenOf(node) : []
  const id = node.attrs.id
  let replacement: PMNode[]
  if (LIST_TYPES.has(type)) {
    replacement = [target.create({ ...attrs, id }, [schema.nodes.itemLine!.create(null, inline), ...kids])]
  }
  else if (target.isTextblock) {
    const text = inline.textBetween(0, inline.size, '\n')
    const content = type === 'codeBlock' ? (text ? schema.text(text) : null) : inline
    replacement = [target.create({ ...attrs, id }, content), ...kids]
  }
  else {
    return insertBlock(editor, type, attrs)
  }
  const tr = state.tr.replaceWith(pos, pos + node.nodeSize, replacement)
  return finish(editor, tr, pos + (LIST_TYPES.has(type) ? 2 : 1) + caret)
}

/** 구분선·영상처럼 글자가 없는 블록을 넣는다. 지금 줄이 비어 있으면 그 자리에 */
export function insertBlock(editor: Editor, type: string, attrs: Record<string, unknown> = {}): boolean {
  const { state } = editor
  const { $from } = state.selection
  const d = blockDepth($from)
  const target = state.schema.nodes[type]
  if (d < 1 || !target) return false
  const node = $from.node(d)
  const pos = $from.before(d)
  const nodes = [target.create(attrs), state.schema.nodes.paragraph!.create()]
  const replace = node.isTextblock && node.content.size === 0
  const tr = replace ? state.tr.replaceWith(pos, pos + node.nodeSize, nodes) : state.tr.insert(pos + node.nodeSize, nodes)
  return finish(editor, tr, (replace ? pos : pos + node.nodeSize) + nodes[0]!.nodeSize + 1)
}

/** 블록 ID로 위치를 찾는다 (끌기 손잡이) */
export function findBlockPos(doc: PMNode, id: string): number | null {
  let found: number | null = null
  doc.descendants((n, pos) => {
    if (found !== null) return false
    if (n.attrs.id === id && blockTypes.has(n.type.name)) found = pos
  })
  return found
}

/** 같은 부모 안에서 한 칸 위·아래로 */
export function moveBlock(editor: Editor, pos: number, dir: -1 | 1): boolean {
  const { state } = editor
  const node = state.doc.nodeAt(pos)
  if (!node) return false
  const $pos = state.doc.resolve(pos)
  const index = $pos.index()
  const parent = $pos.parent
  const first = isList(parent) ? 1 : 0
  if (dir < 0 && index <= first) return false
  if (dir > 0 && index >= parent.childCount - 1) return false
  const other = parent.child(index + dir)
  const at = dir < 0 ? pos - other.nodeSize : pos + other.nodeSize
  const tr = state.tr.delete(pos, pos + node.nodeSize).insert(at, node)
  return finish(editor, tr, at + 1)
}

const stripIds = (json: JSONContent): JSONContent => ({
  ...json,
  ...(json.attrs ? { attrs: { ...json.attrs, id: null } } : {}),
  ...(json.content ? { content: json.content.map(stripIds) } : {}),
})

/** 바로 아래에 복제 (새 ID는 UniqueID가 준다) */
export function duplicateBlock(editor: Editor, pos: number): boolean {
  const { state } = editor
  const node = state.doc.nodeAt(pos)
  if (!node) return false
  const copy = state.schema.nodeFromJSON(stripIds(node.toJSON()))
  const tr = state.tr.insert(pos + node.nodeSize, copy)
  return finish(editor, tr, pos + node.nodeSize + 1)
}

export function deleteBlock(editor: Editor, pos: number): boolean {
  const { state } = editor
  const node = state.doc.nodeAt(pos)
  if (!node) return false
  const tr = state.tr.delete(pos, pos + node.nodeSize)
  if (tr.doc.childCount === 0) tr.insert(0, state.schema.nodes.paragraph!.create())
  return finish(editor, tr, pos)
}
