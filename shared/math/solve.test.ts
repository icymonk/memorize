import { describe, expect, it } from 'vitest'
import { hintScore, judge, resolveProblem } from './solve'

const template = {
  prompt: '{a} + {b} = ?',
  explanation: '{a}에 {b}를 더해요',
  hints: ['{a}부터 세요', '답은 {a+b}보다 작지 않아요'],
  vars: [{ name: 'a', kind: 'int', min: 1, max: 9 }, { name: 'b', kind: 'int', min: 1, max: 9 }],
  answerExpr: 'a + b',
  wrongExprs: ['a - b', 'a * b', 'a + b + 1'],
}

describe('solve (MATH-20~24)', () => {
  it('fills a variant from the seed and grades against those numbers', () => {
    const q = { type: 'short' as const, prompt: '예시', variant: true }
    const a = resolveProblem(q, { template, tolerance: 0 }, 7)
    expect(resolveProblem(q, { template, tolerance: 0 }, 7)).toEqual(a)
    const [x, y] = a.prompt.match(/\d+/g)!.map(Number)
    expect(a.key.answer).toEqual([String(x! + y!)])
    expect(a.hints).toHaveLength(2)
    expect(a.hints[0]).toBe(`${x}부터 세요`)
    expect(judge('short', a, String(x! + y!))).toBe(true)
    expect(judge('short', a, String(x! + y! + 1))).toBe(false)
  })

  it('makes choices for a single-choice variant', () => {
    const r = resolveProblem({ type: 'single', prompt: '', variant: true }, { template }, 3)
    expect(r.choices.length).toBeGreaterThanOrEqual(2)
    expect(judge('single', r, r.key.answer)).toBe(true)
  })

  it('uses the stored question and key hints for plain questions', () => {
    const r = resolveProblem({ type: 'short', prompt: '1/2+1/4' }, { answer: ['3/4'], tolerance: 0, hints: ['통분'], explanation: '해설' }, null)
    expect(r.prompt).toBe('1/2+1/4')
    expect(r.hints).toEqual(['통분'])
    expect(judge('short', r, '0.75')).toBe(true)
    expect(judge('essay', resolveProblem({ type: 'essay', prompt: '' }, { answer: [] }, null), '글')).toBeNull()
  })

  it('falls back to the stored question when a variant has no seed', () => {
    const r = resolveProblem({ type: 'short', prompt: '예시 3+4', variant: true }, { template, answer: ['7'] }, null)
    expect(r.prompt).toBe('예시 3+4')
  })

  it('takes points off per hint without going negative', () => {
    expect(hintScore(0, 20)).toBe(100)
    expect(hintScore(2, 20)).toBe(60)
    expect(hintScore(5, 30)).toBe(0)
  })
})
