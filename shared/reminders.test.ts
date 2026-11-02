import { describe, expect, it } from 'vitest'
import { currentSlot, remindersDoc, remindersInput, toUtcSlot, tzOffsetMin } from './reminders'

describe('reminders (ACC-21, NOTE-38)', () => {
  const now = new Date('2026-10-29T15:07:00Z')
  it('converts local times to UTC slots', () => {
    expect(tzOffsetMin('Asia/Seoul', now)).toBe(540)
    expect(toUtcSlot('21:00', 'Asia/Seoul', now)).toBe('12:00')
    expect(toUtcSlot('08:15', 'Asia/Seoul', now)).toBe('23:15')
    expect(toUtcSlot('09:00', 'Asia/Kathmandu', now)).toBe('03:15')
    expect(toUtcSlot('20:00', 'America/New_York', now)).toBe('00:00')
  })
  it('rounds now down to a 15-minute slot', () => {
    expect(currentSlot(now)).toBe('15:00')
  })
  it('validates 15-minute times and stores UTC slots', () => {
    expect(remindersInput.safeParse({ review: '21:10', journal: null, tz: 'UTC' }).success).toBe(false)
    expect(remindersDoc({ review: '21:00', journal: null, tz: 'Asia/Seoul' }, now)).toEqual({ review: '21:00', journal: null, tz: 'Asia/Seoul', reviewUtc: '12:00', journalUtc: null })
  })
})
