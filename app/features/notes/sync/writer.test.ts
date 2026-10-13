import type { BlockOp } from './diff'
import type { FlatBlock } from './serialize'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { savedFrom } from './diff'
import { chunkOps, createSaveQueue } from './writer'

const b = (id: string, t = id): FlatBlock => ({ id, type: 'paragraph', parentBlockId: null, attrs: {}, content: [{ type: 'text', text: t }] })
const del = (n: number): BlockOp[] => Array.from({ length: n }, (_, i) => ({ kind: 'delete', id: `d${i}` }))

describe('chunkOps', () => {
  it('splits into batches of 400 and leaves room for page meta', () => {
    expect(chunkOps([]).map(c => c.length)).toEqual([0])
    expect(chunkOps(del(399)).map(c => c.length)).toEqual([399])
    expect(chunkOps(del(400)).map(c => c.length)).toEqual([400, 0])
    expect(chunkOps(del(1000)).map(c => c.length)).toEqual([400, 400, 200])
  })
})

describe('createSaveQueue', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function setup(blocks: FlatBlock[], commit = vi.fn(async () => {}), online = () => true) {
    const state = { blocks }
    const statuses: string[] = []
    const q = createSaveQueue({ saved: new Map(), getBlocks: () => state.blocks, commit, onStatus: s => statuses.push(s), online })
    return { q, state, statuses, commit }
  }

  it('debounces edits for 0.8s, then writes changed blocks with page meta', async () => {
    const { q, commit, statuses } = setup([b('a', 'hello')])
    q.schedule()
    q.schedule()
    await vi.advanceTimersByTimeAsync(799)
    expect(commit).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(commit).toHaveBeenCalledTimes(1)
    expect(commit.mock.calls[0]).toEqual([
      [expect.objectContaining({ kind: 'create', id: 'a' })],
      { excerpt: 'hello', blockCount: 1, textLength: 5 },
    ])
    expect(statuses.at(-1)).toBe('saved')
    expect(q.busy).toBe(false)
  })

  it('rebase adopts content received from others without writing it back', () => {
    const { q, commit, state } = setup([b('a')])
    state.blocks = [b('a', 'remote')]
    q.rebase(savedFrom([{ ...b('a', 'remote'), order: 'a0' }]))
    q.flush()
    expect(commit).not.toHaveBeenCalled()
    state.blocks = [b('a', 'remote!')]
    q.flush()
    expect(commit.mock.calls[0]![0]).toEqual([expect.objectContaining({ kind: 'update', id: 'a' })])
  })

  it('flush writes immediately; nothing changed → no write', async () => {
    const { q, commit } = setup([b('a')])
    q.schedule()
    q.flush()
    expect(commit).toHaveBeenCalledTimes(1)
    q.flush()
    expect(commit).toHaveBeenCalledTimes(1)
  })

  it('shows offline while writes wait for the server', async () => {
    let release!: () => void
    const commit = vi.fn(() => new Promise<void>((r) => { release = r }))
    const { q, statuses } = setup([b('a')], commit, () => false)
    q.flush()
    expect(statuses.at(-1)).toBe('offline')
    release()
    await vi.runAllTimersAsync()
    expect(statuses.at(-1)).toBe('saved')
  })

  it('refuses to save a block over the size limit', () => {
    const { q, commit, statuses } = setup([b('a', 'x'.repeat(10_001))])
    q.flush()
    expect(commit).not.toHaveBeenCalled()
    expect(statuses.at(-1)).toBe('tooLarge')
  })

  it('skips saving while block ids are missing or duplicated', () => {
    const { q, commit } = setup([b('a'), b('a')])
    q.flush()
    expect(commit).not.toHaveBeenCalled()
  })

  it('a failed write is retried on the next save', async () => {
    const commit = vi.fn().mockRejectedValueOnce(new Error('denied')).mockResolvedValue(undefined)
    const { q, statuses } = setup([b('a')], commit)
    q.flush()
    await vi.runAllTimersAsync()
    expect(statuses.at(-1)).toBe('error')
    q.flush()
    await vi.runAllTimersAsync()
    expect(commit).toHaveBeenCalledTimes(2)
    expect(commit.mock.calls[1]![0]).toEqual([expect.objectContaining({ kind: 'create', id: 'a' })])
    expect(statuses.at(-1)).toBe('saved')
  })
})
