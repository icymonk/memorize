import { describe, expect, it } from 'vitest'
import { findUnit } from './curriculum'
import { LIBRARY, libraryFor } from './library'
import { checkTemplate, previewTemplate, templateInput } from './template'

describe('built-in library (MATH-15)', () => {
  it('has unique ids on real curriculum concepts', () => {
    expect(new Set(LIBRARY.map(t => t.id)).size).toBe(LIBRARY.length)
    for (const t of LIBRARY) expect(findUnit(t.unit)?.concept, t.id).toBeTruthy()
  })

  it.each(LIBRARY.map(t => [t.id, t] as const))('%s draws as short answer and choice', (_, t) => {
    const tpl = templateInput.parse(t.template)
    expect(checkTemplate(tpl)).toEqual([])
    expect(tpl.wrongExprs.length).toBeGreaterThanOrEqual(3)
    for (const choice of [false, true]) {
      const p = previewTemplate(tpl, choice, 12345, 5, 40)
      expect(p.failed, `${t.id} choice=${choice}`).toBe(0)
      if (choice) for (const s of p.samples) expect(new Set(s.choices).size).toBe(s.choices.length)
    }
  })

  it('finds templates by unit or concept', () => {
    expect(libraryFor('e5-02').map(t => t.id)).toEqual(expect.arrayContaining(['e5-gcd', 'e5-lcm']))
    expect(libraryFor('e5-02-3').map(t => t.id)).toEqual(['e5-gcd'])
    expect(libraryFor('h1-07')).toEqual([])
  })
})
