import { describe, expect, it } from 'vitest'
import { problemSetInput } from './problem-set'

describe('problemSetInput', () => {
  it('defaults and trims', () => {
    expect(problemSetInput.parse({ title: ' 일차방정식 ' })).toEqual({ title: '일차방정식', description: '', grade: null, unit: null, visibility: 'private', editPolicy: 'owner', hintPenalty: 0 })
  })
  it('private sets are owner-only', () => {
    expect(problemSetInput.parse({ title: 'a', visibility: 'private', editPolicy: 'members' }).editPolicy).toBe('owner')
    expect(problemSetInput.parse({ title: 'a', visibility: 'space', editPolicy: 'members' }).editPolicy).toBe('members')
  })
  it('rejects empty titles', () => {
    expect(problemSetInput.safeParse({ title: '  ' }).success).toBe(false)
  })
})
