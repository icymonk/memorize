// 마지막 저장 모양과 지금 문서를 비교해 쓸 것만 고른다 (docs/dev/editor.md 4절)
import type { BlockData, FlatBlock } from './serialize'
import { compareOrder, keysBetween } from './order'
import { blockHash } from './serialize'

export interface SavedBlock { hash: string, parentBlockId: string | null, order: string }
export type SavedMap = Map<string, SavedBlock>

export type BlockOp =
  | { kind: 'create', id: string, data: BlockData & { order: string } }
  | { kind: 'update', id: string, data: BlockData & { order: string } }
  | { kind: 'move', id: string, parentBlockId: string | null, order: string }
  | { kind: 'delete', id: string }

/** 오름차순으로 남길 수 있는 가장 긴 부분열의 위치 (순서를 그대로 둘 블록) */
function longestIncreasing(keys: string[]): Set<number> {
  const tails: number[] = []
  const prev: number[] = Array.from({ length: keys.length }, () => -1)
  keys.forEach((k, i) => {
    let lo = 0
    let hi = tails.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (compareOrder(keys[tails[mid]!]!, k) < 0) lo = mid + 1
      else hi = mid
    }
    if (lo > 0) prev[i] = tails[lo - 1]!
    tails[lo] = i
  })
  const keep = new Set<number>()
  for (let i = tails.at(-1) ?? -1; i >= 0; i = prev[i]!) keep.add(i)
  return keep
}

/** 형제 블록마다 순서 키를 정한다. 같은 부모 아래 순서가 맞는 기존 블록은 키를 유지하고, 나머지만 앞뒤 키 사이 값을 받는다 */
function assignOrders(saved: SavedMap, current: FlatBlock[]): Map<string, string> {
  const groups = new Map<string | null, FlatBlock[]>()
  for (const b of current) groups.set(b.parentBlockId, [...(groups.get(b.parentBlockId) ?? []), b])
  const orders = new Map<string, string>()
  for (const [parent, siblings] of groups) {
    const kept = siblings.map((b, i) => ({ i, s: saved.get(b.id) })).filter(x => x.s && x.s.parentBlockId === parent)
    const lis = longestIncreasing(kept.map(x => x.s!.order))
    const anchors = new Map(kept.filter((_, j) => lis.has(j)).map(x => [x.i, x.s!.order]))
    let prevKey: string | null = null
    let run: number[] = []
    const fill = (next: string | null) => {
      keysBetween(prevKey, next, run.length).forEach((k, j) => orders.set(siblings[run[j]!]!.id, k))
      run = []
    }
    siblings.forEach((b, i) => {
      const key = anchors.get(i)
      if (key === undefined) return run.push(i)
      fill(key)
      orders.set(b.id, key)
      prevKey = key
    })
    fill(null)
  }
  return orders
}

export function diffBlocks(saved: SavedMap, current: FlatBlock[]): { ops: BlockOp[], next: SavedMap } {
  const orders = assignOrders(saved, current)
  const ops: BlockOp[] = []
  const next: SavedMap = new Map()
  for (const b of current) {
    const order = orders.get(b.id)!
    const hash = blockHash(b)
    const before = saved.get(b.id)
    const { id, ...rest } = b
    if (!before) ops.push({ kind: 'create', id, data: { ...rest, order } })
    else if (before.hash !== hash) ops.push({ kind: 'update', id, data: { ...rest, order } })
    else if (before.order !== order || before.parentBlockId !== b.parentBlockId) ops.push({ kind: 'move', id, parentBlockId: b.parentBlockId, order })
    next.set(id, { hash, parentBlockId: b.parentBlockId, order })
  }
  for (const id of saved.keys()) if (!next.has(id)) ops.push({ kind: 'delete', id })
  return { ops, next }
}

/** 불러온 블록으로 비교 기준을 만든다 */
export function savedFrom(blocks: (FlatBlock & { order: string })[]): SavedMap {
  return new Map(blocks.map(b => [b.id, { hash: blockHash(b), parentBlockId: b.parentBlockId, order: b.order }]))
}
