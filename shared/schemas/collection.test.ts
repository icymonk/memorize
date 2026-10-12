import { describe, expect, it } from 'vitest'
import { coerceProp, collectionInput, compareProp, newPropKey } from './collection'

describe('collection schema (NOTE-46)', () => {
  it('rejects duplicate property keys', () => {
    const p = { key: 'p1', name: 'A', type: 'text' }
    expect(collectionInput.safeParse({ name: '모음', schema: [p, p] }).success).toBe(false)
    expect(collectionInput.parse({ name: ' 모음 ', schema: [p] })).toMatchObject({ name: '모음', scope: 'shared', schema: [{ options: [] }] })
  })
  it('coerces values to the property type', () => {
    const sel = { type: 'select' as const, options: ['a', 'b'] }
    expect(coerceProp(sel, 'a')).toBe('a')
    expect(coerceProp(sel, 'z')).toBeNull()
    expect(coerceProp({ type: 'multiSelect', options: ['a', 'b'] }, ['a', 'a', 'z'])).toEqual(['a'])
    expect(coerceProp({ type: 'number', options: [] }, '3.5')).toBe(3.5)
    expect(coerceProp({ type: 'number', options: [] }, 'x')).toBeNull()
    expect(coerceProp({ type: 'date', options: [] }, '2026-10-13')).toBe('2026-10-13')
    expect(coerceProp({ type: 'date', options: [] }, '10/13')).toBeNull()
    expect(coerceProp({ type: 'checkbox', options: [] }, 'yes')).toBe(false)
  })
  it('sorts empty values last', () => {
    expect([3, null, 1].sort(compareProp)).toEqual([1, 3, null])
    expect(['나', '', '가'].sort(compareProp)).toEqual(['가', '나', ''])
  })
  it('makes unused keys', () => {
    expect(newPropKey(['p1', 'p3'])).toBe('p2')
  })
})
