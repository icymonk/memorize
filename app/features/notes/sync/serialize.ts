// 편집기 문서(ProseMirror JSON) ↔ 블록 목록. Firebase에 기대지 않는 순수 함수 (docs/dev/editor.md 2·3절)
import type { JSONContent } from '@tiptap/core'
import { compareOrder } from './order'

/** 들여쓰기 = 자식 블록인 노션식 목록 블록. 첫 줄(itemLine)이 블록 본문, 나머지 자식이 자식 블록 */
export const LIST_TYPES: ReadonlySet<string> = new Set(['bulletItem', 'numberedItem', 'todoItem', 'toggle'])
/** UniqueID를 갖는 블록 노드 */
export const BLOCK_TYPES = ['paragraph', 'heading', 'blockquote', 'callout', 'codeBlock', 'horizontalRule', 'video', ...LIST_TYPES]

export interface BlockData {
  type: string
  parentBlockId: string | null
  attrs: Record<string, unknown>
  content: JSONContent[]
}
export interface FlatBlock extends BlockData { id: string }
export interface StoredBlock extends FlatBlock { order: string }

/** 문서를 문서 순서대로 펼친다. 블록 ID가 없거나 겹치면 저장하지 않도록 `idProblems`로 알린다 */
export function toBlocks(doc: JSONContent): FlatBlock[] {
  const out: FlatBlock[] = []
  const walk = (nodes: JSONContent[], parent: string | null) => {
    for (const node of nodes) {
      const { id, ...attrs } = (node.attrs ?? {}) as Record<string, unknown>
      const isList = LIST_TYPES.has(node.type!)
      const [line, ...children] = isList ? node.content ?? [] : [node]
      out.push({
        id: typeof id === 'string' ? id : '',
        type: node.type!,
        parentBlockId: parent,
        attrs,
        content: (isList ? line?.content : node.content) ?? [],
      })
      if (isList) walk(children, typeof id === 'string' ? id : '')
    }
  }
  walk(doc.content ?? [], null)
  return out
}

export function idProblems(blocks: FlatBlock[]): string[] {
  const seen = new Set<string>()
  const bad: string[] = []
  for (const b of blocks) {
    if (!b.id || seen.has(b.id)) bad.push(b.id)
    seen.add(b.id)
  }
  return bad
}

/** 저장된 블록에서 문서를 다시 만든다. 부모가 사라진 블록은 맨 위로 올린다 */
export function fromBlocks(blocks: StoredBlock[]): JSONContent {
  const ids = new Set(blocks.map(b => b.id))
  const byParent = new Map<string | null, StoredBlock[]>()
  for (const b of blocks) {
    const parent = b.parentBlockId && ids.has(b.parentBlockId) ? b.parentBlockId : null
    byParent.set(parent, [...(byParent.get(parent) ?? []), b])
  }
  const build = (parent: string | null): JSONContent[] =>
    (byParent.get(parent) ?? []).sort((a, b) => compareOrder(a.order, b.order) || compareOrder(a.id, b.id)).map((b) => {
      const attrs = { ...b.attrs, id: b.id }
      if (!LIST_TYPES.has(b.type)) return { type: b.type, attrs, ...(b.content.length ? { content: b.content } : {}) }
      const line: JSONContent = { type: 'itemLine', ...(b.content.length ? { content: b.content } : {}) }
      return { type: b.type, attrs, content: [line, ...build(b.id)] }
    })
  const content = build(null)
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] }
}

export function blockText(b: Pick<BlockData, 'content'>): string {
  const walk = (nodes: JSONContent[]): string => nodes.map(n => n.text ?? (n.content ? walk(n.content) : '')).join('')
  return walk(b.content)
}

function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).filter(k => (v as Record<string, unknown>)[k] !== undefined).sort()
      .map(k => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`
  }
  return JSON.stringify(v) ?? 'null'
}

/** 블록 내용의 지문. 위치(부모·순서)는 따로 비교한다 */
export function blockHash(b: Pick<BlockData, 'type' | 'attrs' | 'content'>): string {
  return stable([b.type, b.attrs, b.content])
}

export const EXCERPT_CHARS = 200

/** 페이지 메타에 함께 저장하는 미리보기·크기 */
export function pageStats(blocks: FlatBlock[]) {
  const texts = blocks.map(blockText)
  return {
    excerpt: texts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, EXCERPT_CHARS),
    blockCount: blocks.length,
    textLength: texts.reduce((n, t) => n + t.length, 0),
  }
}
