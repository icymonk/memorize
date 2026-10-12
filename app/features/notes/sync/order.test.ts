import { describe, expect, it } from 'vitest'
import { compareOrder, keyBetween, keysBetween } from './order'

describe('order keys', () => {
  it('creates keys between, before and after', () => {
    const a = keyBetween(null, null)
    const b = keyBetween(a, null)
    const c = keyBetween(null, a)
    const m = keyBetween(a, b)
    expect([c, a, m, b].toSorted(compareOrder)).toEqual([c, a, m, b])
  })

  it('keeps inserting between the same neighbours without collisions', () => {
    let lo = keyBetween(null, null)
    const hi = keyBetween(lo, null)
    for (let i = 0; i < 200; i++) {
      const k = keyBetween(lo, hi)
      expect(compareOrder(lo, k)).toBe(-1)
      expect(compareOrder(k, hi)).toBe(-1)
      lo = k
    }
  })

  it('appending many keys stays short and sorted', () => {
    const keys = [keyBetween(null, null)]
    for (let i = 0; i < 1000; i++) keys.push(keyBetween(keys.at(-1)!, null))
    expect(keys.toSorted(compareOrder)).toEqual(keys)
    expect(Math.max(...keys.map(k => k.length))).toBeLessThan(30)
  })

  it('spreads n keys evenly in a range', () => {
    const keys = keysBetween('a', 'b', 500)
    expect(keys).toHaveLength(500)
    expect(new Set(keys).size).toBe(500)
    expect(keys.toSorted(compareOrder)).toEqual(keys)
    expect(keys.every(k => k > 'a' && k < 'b')).toBe(true)
    expect(Math.max(...keys.map(k => k.length))).toBeLessThanOrEqual(4)
  })

  it('rejects bad input', () => {
    expect(() => keyBetween('b', 'a')).toThrow()
    expect(() => keyBetween('a0', null)).toThrow()
  })
})
