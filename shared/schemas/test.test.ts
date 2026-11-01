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

describe('grading (TST-14·31)', () => {
  it('applyGrades clamps, keeps auto scores, recomputes status', async () => {
    const { applyGrades } = await import('./test')
    const items = { a: { score: 5, points: 5 }, b: { score: null, points: 10 }, c: { score: 0, points: 5 } }
    expect(applyGrades(items, {})).toMatchObject({ score: 5, gradingStatus: 'pending' })
    const r = applyGrades(items, { b: 12, c: 2 })
    expect(r).toMatchObject({ score: 17, gradingStatus: 'done' })
    expect(r.items.b).toEqual({ score: 10, points: 10 })
  })
  it('finalScores picks best or last per taker, skipping practice', async () => {
    const { finalScores } = await import('./test')
    const rs = [
      { uid: 'a', isPractice: false, score: 8, submittedAtMs: 1 },
      { uid: 'a', isPractice: false, score: 5, submittedAtMs: 2 },
      { uid: 'a', isPractice: true, score: 10, submittedAtMs: 3 },
      { uid: 'b', isPractice: false, score: 3, submittedAtMs: 1 },
    ]
    expect(finalScores(rs, 'best').get('a')!.score).toBe(8)
    expect(finalScores(rs, 'last').get('a')!.score).toBe(5)
    expect(finalScores(rs, 'best').size).toBe(2)
  })
})

describe('test missions (TST-19)', () => {
  it('defaults to off and keeps a target score', () => {
    expect(testInput.parse({ title: 'x' }).mission).toEqual({ enabled: false, minScore: null })
    expect(testInput.parse({ title: 'x', mission: { enabled: true, minScore: 7 } }).mission).toEqual({ enabled: true, minScore: 7 })
  })
  it('completes on any submit without a target, on a graded score with one, never in practice', async () => {
    const { meetsTestMission } = await import('./test')
    expect(meetsTestMission({ minScore: null }, { isPractice: false, score: 0, gradingStatus: 'pending' })).toBe(true)
    expect(meetsTestMission({ minScore: null }, { isPractice: true, score: 10, gradingStatus: 'done' })).toBe(false)
    expect(meetsTestMission({ minScore: 7 }, { isPractice: false, score: 8, gradingStatus: 'pending' })).toBe(false)
    expect(meetsTestMission({ minScore: 7 }, { isPractice: false, score: 7, gradingStatus: 'done' })).toBe(true)
    expect(meetsTestMission({ minScore: 7 }, { isPractice: false, score: 6, gradingStatus: 'done' })).toBe(false)
  })
})
