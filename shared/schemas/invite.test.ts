import { describe, expect, it } from 'vitest'
import { createInviteInput, inviteCodeSchema } from './invite'

describe('inviteCodeSchema', () => {
  it('normalizes case and whitespace', () => {
    expect(inviteCodeSchema.parse(' ab3dk9 ')).toBe('AB3DK9')
  })
  it('rejects wrong length and ambiguous characters', () => {
    expect(inviteCodeSchema.safeParse('ABC').success).toBe(false)
    expect(inviteCodeSchema.safeParse('ABCD0O').success).toBe(false)
  })
})

describe('createInviteInput', () => {
  it('defaults to 7 days and unlimited uses', () => {
    expect(createInviteInput.parse({ spaceId: 's1' })).toEqual({ spaceId: 's1', expiresInDays: 7, maxUses: null })
  })
  it('rejects unsupported expiry', () => {
    expect(createInviteInput.safeParse({ spaceId: 's1', expiresInDays: 3 }).success).toBe(false)
  })
})
