import { describe, expect, it } from 'vitest'
import { nextStreak, RESOLVE_STREAK } from './wrong-notes'

describe('wrong-note streak (WRN-21·22)', () => {
  it('resolves after two in a row and resets on a miss', () => {
    expect(RESOLVE_STREAK).toBe(2)
    expect(nextStreak(0, true)).toEqual({ consecutiveCorrect: 1, resolved: false })
    expect(nextStreak(1, true)).toEqual({ consecutiveCorrect: 2, resolved: true })
    expect(nextStreak(1, false)).toEqual({ consecutiveCorrect: 0, resolved: false })
  })
})
