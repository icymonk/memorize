import type { Template, TemplateDraft } from './template'
import { describe, expect, it } from 'vitest'
import { parseNumber } from './number'
import { PRESETS } from './presets'
import { checkTemplate, drawProblem, fillText, previewTemplate, templateInput } from './template'
import { rat } from './expr'

const tpl = (over: Partial<TemplateDraft> = {}): Template => templateInput.parse({
  prompt: '사과가 {a}개 있고 {b}개를 더 샀어요. 모두 몇 개?',
  vars: [{ name: 'a', kind: 'int', min: 3, max: 20 }, { name: 'b', kind: 'int', min: 1, max: 9 }],
  answerExpr: 'a + b',
  ...over,
})

describe('template (MATH-14)', () => {
  it('fills placeholders but leaves TeX braces', () => {
    const env = { a: rat(3n), b: rat(4n), n: '민수' }
    expect(fillText('{n}는 {a}개, 합 {a+b}', env)).toBe('민수는 3개, 합 7')
    expect(fillText('$\\frac{{a}}{{b}}$, $x^{10}$, {z}', env)).toBe('$\\frac{3}{4}$, $x^{10}$, {z}')
    expect(fillText('$${a}/{b}$$ 와 {a/b}', env)).toBe('$$3/4$$ 와 3/4')
    expect(fillText('$\\frac12 = {a/b}$', env)).toBe('$\\frac12 = \\frac{3}{4}$')
    expect(fillText('가격 \\$5', env)).toBe('가격 \\$5')
  })

  it('same seed → same numbers, and answers follow the expression', () => {
    const t = tpl()
    const a = drawProblem(t, 42, false)
    const b = drawProblem(t, 42, false)
    expect(a).toEqual(b)
    if (!a.ok) throw new Error('draw failed')
    const [x, y] = a.problem.prompt.match(/\d+/g)!.map(Number)
    expect(Number(a.problem.answer)).toBe(x! + y!)
    expect(x).toBeGreaterThanOrEqual(3)
    expect(y).toBeLessThanOrEqual(9)
  })

  it('redraws until conditions hold, and reports impossible ones', () => {
    const t = tpl({ conds: ['a % b == 0', 'b > 1'] })
    for (let s = 0; s < 30; s++) {
      const r = drawProblem(t, s, false)
      expect(r.ok).toBe(true)
    }
    const never = previewTemplate(tpl({ conds: ['a > 100'] }), false, 1)
    expect(never.failed).toBe(20)
    expect(never.samples).toHaveLength(0)
  })

  it('builds unique shuffled choices', () => {
    const t = tpl({ wrongExprs: ['a + b + 1', 'a + b', 'a - b', '1 / 0'] })
    for (let s = 0; s < 30; s++) {
      const r = drawProblem(t, s, true)
      if (!r.ok) throw new Error('draw failed')
      expect(r.problem.choices).toHaveLength(5)
      expect(new Set(r.problem.choices).size).toBe(5)
      expect(r.problem.choices[r.problem.answerIndex]).toBe(r.problem.answer)
    }
  })

  it('draws decimals, fractions and picks', () => {
    const t = tpl({
      prompt: '{n}: {d} + {f}',
      vars: [
        { name: 'd', kind: 'dec', min: 0.1, max: 9.9, digits: 1 },
        { name: 'f', kind: 'frac', min: 2, max: 9 },
        { name: 'n', kind: 'pick', options: ['민수', '지아'] },
        { name: 'k', kind: 'pick', options: ['2', '1/2'] },
        { name: 'm', kind: 'int', min: 0, max: 50, step: 10, exclude: [0] },
      ],
      answerExpr: 'd + f + k + m',
    })
    for (let s = 0; s < 30; s++) {
      const r = drawProblem(t, s, false)
      if (!r.ok) throw new Error('draw failed')
      expect(r.problem.prompt).toMatch(/^(민수|지아): \d\.\d|^(민수|지아): \d /)
      expect(parseNumber(r.problem.answer)).not.toBeNull()
    }
  })

  it('finds mistakes before saving', () => {
    const issues = checkTemplate(tpl({
      vars: [
        { name: 'a', kind: 'int', min: 9, max: 1 },
        { name: 'a', kind: 'frac', min: 1, max: 9 },
        { name: 'max', kind: 'int' },
        { name: 'n', kind: 'pick', options: ['민수'] },
      ],
      calc: [{ name: 's', expr: 'a +' }],
      conds: ['zz > 1', 'n > 1'],
      answerExpr: 'a + s',
    }))
    expect(issues.map(i => `${i.code}@${i.at}`)).toEqual([
      'range@var:a', 'dup@var:a', 'range@var:a', 'reserved@var:max', 'parse@calc:s', 'name@cond:0', 'text@cond:1',
    ])
    expect(checkTemplate(tpl())).toEqual([])
  })

  it('presets are valid and always draw', () => {
    for (const p of PRESETS) {
      const t = templateInput.parse(p.template)
      expect(checkTemplate(t), p.id).toEqual([])
      const r = previewTemplate(t, p.choice, 7, 5, 50)
      expect(r.failed, p.id).toBe(0)
      for (const s of r.samples) expect(parseNumber(s.answer), `${p.id} ${s.answer}`).not.toBeNull()
    }
  })
})
