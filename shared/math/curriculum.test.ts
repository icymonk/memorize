import { describe, expect, it } from 'vitest'
import { CURRICULUM, findUnit, GRADES, unitLabel } from './curriculum'

describe('curriculum kr-2022 (MATH-13)', () => {
  it('covers 초1~고1 with unique codes', () => {
    expect(GRADES.map(g => g.label)).toEqual(['초1', '초2', '초3', '초4', '초5', '초6', '중1', '중2', '중3', '고1'])
    const codes = CURRICULUM.grades.flatMap(g => g.areas.flatMap(a => a.units.flatMap(u => [u.code, ...u.children.map(c => c.code)])))
    expect(new Set(codes).size).toBe(codes.length)
    for (const g of CURRICULUM.grades) expect(g.areas.every(a => a.units.length > 0)).toBe(true)
  })
  it('labels units and concepts', () => {
    expect(findUnit('m1-04')?.unit.name).toBe('일차방정식')
    expect(unitLabel({ code: 'm1-04-2', custom: null })).toBe('중1 · 일차방정식 · 등식의 성질')
    expect(unitLabel({ code: null, custom: '경시 대비' })).toBe('경시 대비')
    expect(unitLabel(null)).toBe('')
  })
})
