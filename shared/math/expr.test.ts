import { describe, expect, it } from 'vitest'
import { evalExpr, ExprError, exprNames, formatValue, parseExpr, rat, toNumber } from './expr'

const f = (s: string, env = {}) => formatValue(evalExpr(s, env))

describe('expr (MATH-14 계산기)', () => {
  it('keeps fractions exact', () => {
    expect(f('0.1 + 0.2 == 0.3')).toBe('1')
    expect(f('1/3 + 1/6')).toBe('1/2')
    expect(f('2/4')).toBe('1/2')
    expect(f('0.1 + 0.2')).toBe('0.3')
    expect(formatValue(evalExpr('3/4'), true)).toBe('\\frac{3}{4}')
    expect(formatValue(evalExpr('-3/4'), true)).toBe('-\\frac{3}{4}')
  })
  it('follows precedence', () => {
    expect(f('2 + 3 * 4')).toBe('14')
    expect(f('(2 + 3) * 4')).toBe('20')
    expect(f('2 ^ 3 ^ 2')).toBe('512')
    expect(f('-2 ^ 2')).toBe('-4')
    expect(f('2 ^ -1')).toBe('1/2')
    expect(f('7 % 3')).toBe('1')
    expect(f('-7 % 3')).toBe('2')
    expect(f('1 < 2 && 2 < 3 || 0')).toBe('1')
    expect(f('!(1 == 1)')).toBe('0')
  })
  it('uses variables and functions', () => {
    const env = { a: rat(12n), b: rat(18n), c: rat(7n, 2n, true) }
    expect(f('gcd(a, b)', env)).toBe('6')
    expect(f('lcm(a, b)', env)).toBe('36')
    expect(f('abs(-a)', env)).toBe('12')
    expect(f('sqrt(16/9)')).toBe('4/3')
    expect(toNumber(evalExpr('sqrt(2)'))).toBeCloseTo(Math.SQRT2)
    expect(f('round(c)', env)).toBe('4')
    expect(f('round(-2.5)')).toBe('-3')
    expect(f('round(1.2345, 2)')).toBe('1.23')
    expect(f('floor(-1.5)')).toBe('-2')
    expect(f('ceil(1.2)')).toBe('2')
    expect(f('min(3, 1, 2) + max(3, 1, 2)')).toBe('4')
    expect(f('c * 2', env)).toBe('7')
    expect(f('c + 0.25', env)).toBe('3.75')
  })
  it('rejects bad input without running code', () => {
    const code = (s: string, env = {}) => {
      try {
        evalExpr(s, env)
        return 'ok'
      }
      catch (e) {
        return (e as ExprError).code
      }
    }
    expect(code('1 +')).toBe('syntax')
    expect(code('2a')).toBe('syntax')
    expect(code('constructor')).toBe('name')
    expect(code('alert(1)')).toBe('name')
    expect(code('a.b')).toBe('syntax')
    expect(code('1 / 0')).toBe('math')
    expect(code('5 % 0')).toBe('math')
    expect(code('sqrt(-1)')).toBe('math')
    expect(code('gcd(1.5, 2)')).toBe('math')
    expect(code('name', { name: '철수' })).toBe('text')
    expect(code('10 ^ 50')).toBe('big')
    expect(code('('.repeat(60) + '1' + ')'.repeat(60))).toBe('syntax')
  })
  it('lists names', () => {
    expect([...exprNames(parseExpr('gcd(a, b) + c * 2'))]).toEqual(['a', 'b', 'c'])
  })
})
