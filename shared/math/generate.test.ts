import { describe, expect, it } from 'vitest'
import { pickTemplates } from './generate'

const pool = [
  { id: 'a', difficulty: 'easy', canChoice: true },
  { id: 'b', difficulty: 'normal', canChoice: true },
  { id: 'c', difficulty: 'normal', canChoice: false },
]

describe('pickTemplates (MATH-15)', () => {
  it('cycles through every template before repeating, with fresh seeds', () => {
    const { picks } = pickTemplates(pool, { difficulty: 'any', count: 5, format: 'short', seed: 1 })
    expect(picks).toHaveLength(5)
    expect(new Set(picks.slice(0, 3).map(p => p.entry.id)).size).toBe(3)
    expect(new Set(picks.map(p => p.seed)).size).toBe(5)
    expect(picks.every(p => !p.choice)).toBe(true)
  })

  it('is reproducible from the seed', () => {
    const o = { difficulty: 'any', count: 10, format: 'mix' as const, seed: 9 }
    expect(pickTemplates(pool, o)).toEqual(pickTemplates(pool, o))
  })

  it('filters by difficulty and relaxes when nothing matches', () => {
    const n = pickTemplates(pool, { difficulty: 'normal', count: 4, format: 'choice', seed: 2 })
    expect(n.relaxed).toBe(false)
    expect(n.picks.every(p => p.entry.difficulty === 'normal')).toBe(true)
    expect(n.picks.filter(p => p.entry.id === 'c').every(p => !p.choice)).toBe(true)
    const h = pickTemplates(pool, { difficulty: 'hard', count: 3, format: 'short', seed: 2 })
    expect(h.relaxed).toBe(true)
    expect(h.picks).toHaveLength(3)
  })

  it('mixes formats and returns nothing for an empty pool', () => {
    const { picks } = pickTemplates(pool.slice(0, 2), { difficulty: 'any', count: 4, format: 'mix', seed: 3 })
    expect(picks.map(p => p.choice)).toEqual([false, true, false, true])
    expect(pickTemplates([], { difficulty: 'any', count: 5, format: 'mix', seed: 1 }).picks).toEqual([])
  })
})
