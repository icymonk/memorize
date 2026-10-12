import { describe, expect, it } from 'vitest'
import { meaningChanged } from './cards'

describe('meaningChanged', () => {
  it('is false when any meaning survives (case/space-insensitive)', () => {
    expect(meaningChanged(['사과'], ['사과', '애플'])).toBe(false)
    expect(meaningChanged(['to  Run'], ['to run'])).toBe(false)
    expect(meaningChanged(['달리다', '운영하다'], ['운영하다'])).toBe(false)
  })
  it('is true when all meanings are replaced', () => {
    expect(meaningChanged(['사과'], ['배'])).toBe(true)
  })
  it('ignores empty sides', () => {
    expect(meaningChanged([], ['배'])).toBe(false)
    expect(meaningChanged(['사과'], [])).toBe(false)
  })
})
