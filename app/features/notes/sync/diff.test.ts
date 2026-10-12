import type { FlatBlock } from './serialize'
import { describe, expect, it } from 'vitest'
import { diffBlocks, savedFrom } from './diff'
import { compareOrder } from './order'

const b = (id: string, t = id, parentBlockId: string | null = null): FlatBlock =>
  ({ id, type: 'paragraph', parentBlockId, attrs: {}, content: [{ type: 'text', text: t }] })

function save(blocks: FlatBlock[]) {
  const { ops, next } = diffBlocks(new Map(), blocks)
  return { ops, saved: next }
}
const kinds = (ops: { kind: string, id: string }[]) => ops.map(o => `${o.kind}:${o.id}`)

describe('diffBlocks', () => {
  it('first save creates every block with increasing orders', () => {
    const { ops, saved } = save([b('a'), b('b'), b('c')])
    expect(kinds(ops)).toEqual(['create:a', 'create:b', 'create:c'])
    const orders = ['a', 'b', 'c'].map(id => saved.get(id)!.order)
    expect(orders.toSorted(compareOrder)).toEqual(orders)
  })

  it('no change → no writes', () => {
    const { saved } = save([b('a'), b('b')])
    expect(diffBlocks(saved, [b('a'), b('b')]).ops).toEqual([])
  })

  it('editing one block writes only that block', () => {
    const { saved } = save([b('a'), b('b'), b('c')])
    const { ops } = diffBlocks(saved, [b('a'), b('b', 'changed'), b('c')])
    expect(kinds(ops)).toEqual(['update:b'])
    expect(ops[0]!.kind === 'update' && ops[0]!.data.order).toBe(saved.get('b')!.order)
  })

  it('splitting a block (Enter) updates it and creates one block between neighbours', () => {
    const { saved } = save([b('a'), b('b')])
    const { ops, next } = diffBlocks(saved, [b('a', 'a-left'), b('n', 'right'), b('b')])
    expect(kinds(ops)).toEqual(['update:a', 'create:n'])
    expect(compareOrder(next.get('a')!.order, next.get('n')!.order)).toBe(-1)
    expect(compareOrder(next.get('n')!.order, next.get('b')!.order)).toBe(-1)
  })

  it('merging blocks (Backspace) updates the survivor and deletes the other', () => {
    const { saved } = save([b('a'), b('b'), b('c')])
    expect(kinds(diffBlocks(saved, [b('a', 'ab'), b('c')]).ops)).toEqual(['update:a', 'delete:b'])
  })

  it('moving one block rewrites only its order', () => {
    const { saved } = save([b('a'), b('b'), b('c'), b('d')])
    const { ops, next } = diffBlocks(saved, [b('a'), b('c'), b('d'), b('b')])
    expect(kinds(ops)).toEqual(['move:b'])
    const orders = ['a', 'c', 'd', 'b'].map(id => next.get(id)!.order)
    expect(orders.toSorted(compareOrder)).toEqual(orders)
  })

  it('indenting a block moves it under the new parent', () => {
    const { saved } = save([b('a'), b('b'), b('c')])
    const { ops, next } = diffBlocks(saved, [b('a'), b('b', 'b', 'a'), b('c')])
    expect(ops).toEqual([{ kind: 'move', id: 'b', parentBlockId: 'a', order: next.get('b')!.order }])
  })

  it('pasting many blocks in the middle spreads keys only in that gap', () => {
    const { saved } = save([b('a'), b('z')])
    const pasted = Array.from({ length: 300 }, (_, i) => b(`p${i}`))
    const { ops, next } = diffBlocks(saved, [b('a'), ...pasted, b('z')])
    expect(ops).toHaveLength(300)
    expect(ops.every(o => o.kind === 'create')).toBe(true)
    const orders = ['a', ...pasted.map(p => p.id), 'z'].map(id => next.get(id)!.order)
    expect(orders.toSorted(compareOrder)).toEqual(orders)
    expect(new Set(orders).size).toBe(orders.length)
  })

  it('undo restoring a deleted block re-creates it', () => {
    const { saved } = save([b('a'), b('b')])
    const { next } = diffBlocks(saved, [b('a')])
    expect(kinds(diffBlocks(next, [b('a'), b('b')]).ops)).toEqual(['create:b'])
  })

  it('savedFrom builds the baseline from loaded blocks', () => {
    const loaded = [{ ...b('a'), order: 'V' }, { ...b('c', 'c', 'a'), order: 'V' }]
    expect(diffBlocks(savedFrom(loaded), [b('a'), b('c', 'c', 'a')]).ops).toEqual([])
  })
})
