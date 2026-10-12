import type { JSONContent } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import { blockHash, fromBlocks, idProblems, pageStats, toBlocks } from './serialize'

const text = (t: string) => [{ type: 'text', text: t }]
const p = (id: string, t: string): JSONContent => ({ type: 'paragraph', attrs: { id }, content: text(t) })
const item = (type: string, id: string, t: string, children: JSONContent[] = [], attrs = {}): JSONContent =>
  ({ type, attrs: { id, ...attrs }, content: [{ type: 'itemLine', content: text(t) }, ...children] })

const doc: JSONContent = { type: 'doc', content: [
  { type: 'heading', attrs: { id: 'h', level: 1 }, content: text('제목') },
  item('bulletItem', 'b1', 'a', [item('todoItem', 't1', 'a1', [], { checked: true }), p('p2', 'inner')]),
  { type: 'horizontalRule', attrs: { id: 'hr' } },
  p('p1', 'end'),
] }

describe('toBlocks', () => {
  it('flattens list items into child blocks in document order', () => {
    const blocks = toBlocks(doc)
    expect(blocks.map(b => [b.id, b.type, b.parentBlockId])).toEqual([
      ['h', 'heading', null],
      ['b1', 'bulletItem', null],
      ['t1', 'todoItem', 'b1'],
      ['p2', 'paragraph', 'b1'],
      ['hr', 'horizontalRule', null],
      ['p1', 'paragraph', null],
    ])
    expect(blocks[0]!.attrs).toEqual({ level: 1 })
    expect(blocks[1]!.content).toEqual(text('a'))
    expect(blocks[2]!.attrs).toEqual({ checked: true })
    expect(blocks[4]!.content).toEqual([])
  })

  it('round-trips through stored blocks', () => {
    const stored = toBlocks(doc).map((b, i) => ({ ...b, order: `a${i + 1}` }))
    expect(fromBlocks(stored.toReversed())).toEqual(doc)
  })

  it('reports missing and duplicate ids', () => {
    expect(idProblems(toBlocks(doc))).toEqual([])
    const bad = toBlocks({ type: 'doc', content: [p('x', '1'), p('x', '2'), { type: 'paragraph' }] })
    expect(idProblems(bad)).toEqual(['x', ''])
  })
})

describe('fromBlocks', () => {
  it('lifts orphans to the top level and never returns an empty doc', () => {
    const d = fromBlocks([{ id: 'c', type: 'paragraph', parentBlockId: 'gone', order: 'a', attrs: {}, content: text('x') }])
    expect(d.content).toEqual([{ type: 'paragraph', attrs: { id: 'c' }, content: text('x') }])
    expect(fromBlocks([]).content).toEqual([{ type: 'paragraph' }])
  })
})

describe('blockHash / pageStats', () => {
  it('hash ignores key order and position but not content', () => {
    const a = { type: 'heading', attrs: { level: 2, x: 1 }, content: text('a') }
    expect(blockHash(a)).toBe(blockHash({ content: text('a'), attrs: { x: 1, level: 2 }, type: 'heading' }))
    expect(blockHash(a)).not.toBe(blockHash({ ...a, attrs: { level: 3, x: 1 } }))
    expect(blockHash(a)).not.toBe(blockHash({ ...a, content: [{ type: 'text', text: 'a', marks: [{ type: 'bold' }] }] }))
  })

  it('computes excerpt, block count and text length', () => {
    const s = pageStats(toBlocks(doc))
    expect(s).toEqual({ excerpt: '제목 a a1 inner end', blockCount: 6, textLength: 2 + 1 + 2 + 5 + 3 })
    const long = pageStats(toBlocks({ type: 'doc', content: [p('l', 'x'.repeat(500))] }))
    expect(long.excerpt).toHaveLength(200)
  })
})
