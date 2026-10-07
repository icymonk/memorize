import { describe, expect, it } from 'vitest'
import { completeOnboardingInput, ensureAccountInput, personalSpaceId } from './account'

describe('ACC-04 account schemas', () => {
  it('builds the personal space id from uid', () => {
    expect(personalSpaceId('abc')).toBe('p_abc')
  })

  it('trims and limits display names', () => {
    expect(completeOnboardingInput.parse({ displayName: '  민수 ', timezone: 'Asia/Seoul' }).displayName).toBe('민수')
    expect(completeOnboardingInput.safeParse({ displayName: '   ', timezone: 'Asia/Seoul' }).success).toBe(false)
    expect(completeOnboardingInput.safeParse({ displayName: 'a'.repeat(31), timezone: 'Asia/Seoul' }).success).toBe(false)
  })

  it('requires timezone and locale', () => {
    expect(ensureAccountInput.safeParse({ timezone: '', locale: 'ko' }).success).toBe(false)
    expect(ensureAccountInput.safeParse({ timezone: 'Asia/Seoul', locale: 'ko-KR' }).success).toBe(true)
  })
})
