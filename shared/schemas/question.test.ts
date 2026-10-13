import { describe, expect, it } from 'vitest'
import { gradeAnswer, keyFits, questionInput, questionKeyInput } from './question'

const key = (answer: (number | boolean | string)[], over = {}) => questionKeyInput.parse({ answer, ...over })

describe('question schema (TST-01·02)', () => {
  it('defaults new questions to private with answers for authors only', () => {
    const q = questionInput.parse({ type: 'ox', prompt: '지구는 둥글다' })
    expect(q).toMatchObject({ sharing: 'private', answerVisibility: 'authors', difficulty: 'normal', defaultPoints: 10, choices: [] })
  })
  it('checks that the answer fits the type', () => {
    expect(keyFits({ type: 'single', choices: ['a', 'b'] }, key([1]))).toBe(true)
    expect(keyFits({ type: 'single', choices: ['a', 'b'] }, key([0, 1]))).toBe(false)
    expect(keyFits({ type: 'multi', choices: ['a', 'b', 'c'] }, key([0, 2]))).toBe(true)
    expect(keyFits({ type: 'multi', choices: ['a'] }, key([0]))).toBe(false)
    expect(keyFits({ type: 'single', choices: ['a', 'b'] }, key([2]))).toBe(false)
    expect(keyFits({ type: 'ox', choices: [] }, key([false]))).toBe(true)
    expect(keyFits({ type: 'short', choices: [] }, key(['apple']))).toBe(true)
    expect(keyFits({ type: 'short', choices: [] }, key([]))).toBe(false)
    expect(keyFits({ type: 'essay', choices: [] }, key([]))).toBe(true)
  })
})

describe('gradeAnswer (TST-30)', () => {
  it('grades choices regardless of order', () => {
    expect(gradeAnswer('multi', key([0, 2]), [2, 0], 5)).toBe(5)
    expect(gradeAnswer('multi', key([0, 2]), [0], 5)).toBe(0)
    expect(gradeAnswer('single', key([1]), [1], 3)).toBe(3)
  })
  it('grades OX and short answers with the case/space options', () => {
    expect(gradeAnswer('ox', key([true]), true, 2)).toBe(2)
    expect(gradeAnswer('ox', key([true]), false, 2)).toBe(0)
    expect(gradeAnswer('short', key(['New York', 'NYC']), ' new york ', 4)).toBe(4)
    expect(gradeAnswer('short', key(['New York'], { ignoreCase: false }), 'new york', 4)).toBe(0)
    expect(gradeAnswer('short', key(['New York'], { ignoreSpaces: true }), 'newyork', 4)).toBe(4)
    expect(gradeAnswer('short', key(['a']), '', 4)).toBe(0)
  })
  it('leaves essays for manual grading', () => {
    expect(gradeAnswer('essay', key([]), '글', 10)).toBeNull()
  })
})

describe('question media and subject', () => {
  it('defaults to no subject and no media, caps media at 5', () => {
    const q = questionInput.parse({ type: 'essay', prompt: '설명하시오' })
    expect(q.subjectId).toBeNull()
    expect(q.media).toEqual([])
    const f = { id: 'f', name: 'a.mp3', path: 'p', contentType: 'audio/mpeg', size: 1 }
    expect(questionInput.safeParse({ type: 'essay', prompt: 'x', media: Array.from({ length: 6 }, () => f) }).success).toBe(false)
  })
})

