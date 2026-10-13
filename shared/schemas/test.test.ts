import { describe, expect, it } from 'vitest'
import { maxScoreOf, testInput, testTakers } from './test'

describe('testInput (TST-10~16)', () => {
  it('defaults to one attempt, instant results, everyone', () => {
    const t = testInput.parse({ title: '1단원 평가' })
    expect(t.settings).toMatchObject({ maxAttempts: 1, scoring: 'best', resultRelease: 'instant', timeLimitMin: null, practice: false })
    expect(t.assignees).toEqual({ all: true, uids: [], groupIds: [] })
  })

  it('rejects a close time before the open time and too many questions', () => {
    expect(testInput.safeParse({ title: 'x', settings: { openAt: 2000, closeAt: 1000 } }).success).toBe(false)
    const refs = Array.from({ length: 101 }, (_, i) => ({ questionId: `q${i}`, points: 1 }))
    expect(testInput.safeParse({ title: 'x', questionRefs: refs }).success).toBe(false)
  })
})

describe('testTakers (TST-16)', () => {
  const active = ['h', 'a', 'b', 'c']
  it('everyone except hosts', () => {
    expect(testTakers({ all: true, uids: [], groupIds: [] }, ['h'], active)).toEqual(['a', 'b', 'c'])
  })
  it('picked members and group members, only active ones', () => {
    expect(testTakers({ all: false, uids: ['a', 'gone'], groupIds: ['g1'] }, ['h'], active, { b: ['g1'], h: ['g1'] }).sort()).toEqual(['a', 'b'])
  })
})

it('maxScoreOf sums points', () => {
  expect(maxScoreOf([{ points: 10 }, { points: 5 }])).toBe(15)
})

describe('attempt timing (TST-21~23)', () => {
  it('deadline is the earlier of time limit and close', async () => {
    const { attemptDeadline } = await import('./test')
    expect(attemptDeadline(0, { timeLimitMin: 10, closeAt: null })).toBe(600_000)
    expect(attemptDeadline(0, { timeLimitMin: 10, closeAt: 60_000 })).toBe(60_000)
    expect(attemptDeadline(0, { timeLimitMin: null, closeAt: null })).toBeNull()
  })
  it('canStart checks window and attempts; practice ignores attempts', async () => {
    const { canStart } = await import('./test')
    const s = { openAt: 100, closeAt: 200, maxAttempts: 1, practice: false }
    expect(canStart({ status: 'open', settings: s }, 0, 50)).toBe('notOpen')
    expect(canStart({ status: 'open', settings: s }, 0, 150)).toBe('ok')
    expect(canStart({ status: 'open', settings: s }, 1, 150)).toBe('noAttempts')
    expect(canStart({ status: 'open', settings: { ...s, practice: true } }, 5, 150)).toBe('ok')
    expect(canStart({ status: 'open', settings: s }, 0, 200)).toBe('closed')
    expect(canStart({ status: 'closed', settings: { ...s, closeAt: null } }, 0, 150)).toBe('closed')
  })
})
