import { describe, expect, it } from 'vitest'
import { feedbackScore, formatScore, leaveFeedbackInput } from './feedback'

describe('feedback score (CMN-24)', () => {
  it('accepts each format only within its range', () => {
    expect(feedbackScore.safeParse({ format: '100', value: 87 }).success).toBe(true)
    expect(feedbackScore.safeParse({ format: '100', value: 101 }).success).toBe(false)
    expect(feedbackScore.safeParse({ format: '100', value: 8.5 }).success).toBe(false)
    expect(feedbackScore.safeParse({ format: 'grade', value: 'B' }).success).toBe(true)
    expect(feedbackScore.safeParse({ format: 'grade', value: 'E' }).success).toBe(false)
    expect(feedbackScore.safeParse({ format: 'stars', value: 5 }).success).toBe(true)
    expect(feedbackScore.safeParse({ format: 'stars', value: 0 }).success).toBe(false)
  })

  it('score is optional in leaveFeedback', () => {
    const base = { spaceId: 's', pageId: 'p', stamp: 'great', body: '' }
    expect(leaveFeedbackInput.parse(base).score).toBeNull()
    expect(leaveFeedbackInput.parse({ ...base, score: { format: 'stars', value: 3 } }).score).toEqual({ format: 'stars', value: 3 })
  })

  it('formats for display', () => {
    expect(formatScore({ format: '100', value: 90 })).toBe('90점')
    expect(formatScore({ format: 'grade', value: 'A' })).toBe('A')
    expect(formatScore({ format: 'stars', value: 3 })).toBe('★★★☆☆')
  })
})
