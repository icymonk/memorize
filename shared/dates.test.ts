import { describe, expect, it } from 'vitest'
import { dateKey, weekKey } from './dates'

describe('dateKey', () => {
  it('uses the user time zone, not UTC', () => {
    const instant = new Date('2026-10-06T16:30:00Z')
    expect(dateKey(instant, 'Asia/Seoul')).toBe('2026-10-07')
    expect(dateKey(instant, 'America/New_York')).toBe('2026-10-06')
  })
})

describe('weekKey', () => {
  it('returns ISO weeks', () => {
    expect(weekKey('2026-10-06')).toBe('2026-W41')
    expect(weekKey('2027-01-01')).toBe('2026-W53')
    expect(weekKey('2026-01-01')).toBe('2026-W01')
  })
})
