import { describe, expect, it } from 'vitest'
import { withSubjects } from './subjects'

describe('withSubjects (WS-09)', () => {
  const subjects = [{ id: 'en', name: '영어', color: 'blue' }]
  it('adds workspace subjects to the 과목 property only', () => {
    expect(withSubjects({ key: 'subjects', name: '과목', type: 'multiSelect', options: ['수학'] }, subjects).options).toEqual(['수학', '영어'])
    const tags = { key: 'tags', name: '태그', type: 'multiSelect' as const, options: [] }
    expect(withSubjects(tags, subjects)).toBe(tags)
  })
})
