import { describe, expect, it } from 'vitest'
import { isPeriodDay, missionInput, participantsOf, periodKey, periodKeys } from './mission'

const base = missionInput.parse({ title: '줄넘기', startDate: '2026-10-12' })

describe('mission schedule (MIS-11)', () => {
  it('weekly missions need weekdays and the end cannot precede the start', () => {
    expect(missionInput.safeParse({ title: 'a', startDate: '2026-10-12', recurrence: { kind: 'weekly' } }).success).toBe(false)
    expect(missionInput.safeParse({ title: 'a', startDate: '2026-10-12', endDate: '2026-10-11' }).success).toBe(false)
  })

  it('period keys: once is a single period, daily every day, weekly only on chosen weekdays', () => {
    expect(periodKeys(base, '2026-10-12', '2026-10-18')).toEqual(['once'])
    expect(periodKey(base, '2026-10-13')).toBe('once')
    const daily = { ...base, recurrence: { kind: 'daily' as const, weekdays: [] }, endDate: '2026-10-14' }
    expect(periodKeys(daily, '2026-10-10', '2026-10-20')).toEqual(['2026-10-12', '2026-10-13', '2026-10-14'])
    const weekly = { ...base, recurrence: { kind: 'weekly' as const, weekdays: [1, 3] } }
    expect(periodKeys(weekly, '2026-10-12', '2026-10-21')).toEqual(['2026-10-12', '2026-10-14', '2026-10-19', '2026-10-21'])
    expect(isPeriodDay(weekly, '2026-10-13')).toBe(false)
    expect(periodKey(weekly, '2026-10-14')).toBe('2026-10-14')
  })
})

describe('participants (MIS-12·14)', () => {
  it('personal goals are only the host; "include me" adds the host to assignees', () => {
    expect(participantsOf({ ...base, isPersonal: true }, 'h', ['h', 'a'])).toEqual(['h'])
    expect(participantsOf(base, 'h', ['h', 'a', 'b'])).toEqual(['a', 'b'])
    expect(participantsOf({ ...base, includeSelf: true, assignees: { all: false, uids: ['b'] } }, 'h', ['h', 'a', 'b'])).toEqual(['b', 'h'])
  })
})

describe('submissions (MIS-22·23·32)', () => {
  it('check missions and submissions without anyone to review finish at once', async () => {
    const { initialStatus, isLate, reviewersFor, submissionId } = await import('./mission')
    expect(reviewersFor({ hostIds: ['h', 'a'], reviewerIds: ['r', 'h'] }, 'h')).toEqual(['a', 'r'])
    expect(initialStatus('check', ['h'])).toBe('done')
    expect(initialStatus('submission', [])).toBe('done')
    expect(initialStatus('submission', ['h'])).toBe('submitted')
    expect(isLate({ ...base, endDate: '2026-10-14' }, 'once', '2026-10-15')).toBe(true)
    expect(isLate(base, 'once', '2030-01-01')).toBe(false)
    expect(isLate(base, '2026-10-12', '2026-10-12')).toBe(false)
    expect(submissionId('u', 'once')).toBe('u_once')
  })
})
