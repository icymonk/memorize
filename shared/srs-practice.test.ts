import { describe, expect, it } from 'vitest'
import { fixWrong, newState, practice, review } from './srs'

describe('practice answers update card state (VOC-40·44)', () => {
  const now = 1_000_000
  it('a new card becomes learning and records when it was first seen', () => {
    const s = practice(newState(0), true, now)
    expect(s).toMatchObject({ status: 'learning', correct: 1, wrong: 0, due: now, firstSeenAt: now })
  })
  it('a wrong answer puts a scheduled card back into today\'s review without changing its interval', () => {
    const r = { ...newState(0), status: 'review' as const, intervalDays: 10, due: now + 5e8 }
    const s = practice(r, false, now)
    expect(s).toMatchObject({ status: 'review', intervalDays: 10, due: now, wrong: 1 })
    expect(s.firstSeenAt).toBeUndefined()
  })
  it('override turns the counted miss into a correct answer', () => {
    expect(fixWrong({ ...newState(0), wrong: 1 })).toMatchObject({ wrong: 0, correct: 1 })
  })
  it('review stamps firstSeenAt only for new cards', () => {
    expect(review(newState(0), 'good', now).firstSeenAt).toBe(now)
    expect(review({ ...newState(0), status: 'review', firstSeenAt: 5 }, 'good', now).firstSeenAt).toBe(5)
  })
})
