import { describe, expect, it } from 'vitest'
import { DAY_MS, MIN_EASE, newState, preview, RELEARN_MS, review } from './srs'

const now = 1_800_000_000_000

describe('srs (R3)', () => {
  it('good grows 1 → 3 → interval × ease', () => {
    let s = review(newState(now), 'good', now)
    expect(s.intervalDays).toBe(1)
    expect(s.status).toBe('review')
    s = review(s, 'good', now)
    expect(s.intervalDays).toBe(3)
    s = review(s, 'good', now)
    expect(s.intervalDays).toBe(8)
    expect(s.due).toBe(now + 8 * DAY_MS)
  })
  it('again relearns in 10 minutes, counts a lapse only after learning', () => {
    const fresh = review(newState(now), 'again', now)
    expect(fresh.due).toBe(now + RELEARN_MS)
    expect(fresh.lapses).toBe(0)
    expect(fresh.wrong).toBe(1)
    const lapsed = review(review(newState(now), 'good', now), 'again', now)
    expect(lapsed.lapses).toBe(1)
    expect(lapsed.reps).toBe(0)
    expect(lapsed.status).toBe('learning')
  })
  it('ease never drops below the minimum', () => {
    let s = newState(now)
    for (let i = 0; i < 20; i++) s = review(s, 'again', now)
    expect(s.ease).toBe(MIN_EASE)
  })
  it('hard < good < easy, reaching mastered after 21 days', () => {
    const p = preview(review(review(newState(now), 'good', now), 'good', now), now)
    expect(p.again).toBeLessThan(p.hard)
    expect(p.hard).toBeLessThan(p.good)
    expect(p.good).toBeLessThan(p.easy)
    let s = newState(now)
    while (s.status !== 'mastered') s = review(s, 'good', now)
    expect(s.intervalDays).toBeGreaterThanOrEqual(21)
  })
})

describe('progressDelta (VOC-41)', () => {
  it('counts transitions', async () => {
    const { progressDelta } = await import('./srs')
    expect(progressDelta(undefined, 'learning')).toEqual({ mastered: 0, learning: 1 })
    expect(progressDelta('review', 'mastered')).toEqual({ mastered: 1, learning: -1 })
    expect(progressDelta('mastered', undefined)).toEqual({ mastered: -1, learning: 0 })
    expect(progressDelta('learning', 'review')).toEqual({ mastered: 0, learning: 0 })
    expect(progressDelta(undefined, 'new')).toEqual({ mastered: 0, learning: 0 })
  })
})
