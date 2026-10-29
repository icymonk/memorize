import { describe, expect, it } from 'vitest'
import { parseNumber, sameNumber } from './number'

describe('parseNumber', () => {
  it.each([
    ['3', 3], ['-2.5', -2.5], ['+4', 4], ['.5', 0.5], ['1,000', 1000], ['1,234.5', 1234.5],
    ['3/4', 0.75], [' -3 / 4 ', -0.75], ['1 1/2', 1.5], ['-1 1/2', -1.5], ['\\frac{3}{4}', 0.75], ['$\\frac{1}{2}$', 0.5], ['−7', -7], ['３', 3],
  ])('%s', (s, v) => expect(parseNumber(s)).toBeCloseTo(v))
  it.each(['', 'abc', '1/0', '1,00', '3x', '1/2/3', '--1'])('rejects %s', s => expect(parseNumber(s)).toBeNull())
})

describe('sameNumber', () => {
  it('fraction equals decimal', () => {
    expect(sameNumber(1 / 3 + 1 / 3 + 1 / 3, 1, 0)).toBe(true)
    expect(sameNumber(0.1 + 0.2, 0.3, 0)).toBe(true)
    expect(sameNumber(0.33, 1 / 3, 0)).toBe(false)
    expect(sameNumber(0.33, 1 / 3, 0.01)).toBe(true)
  })
})
