import { describe, expect, it } from 'vitest'
import { currentItem, evenSchedule, expectedPosition, isAssigned, isSpoiler, pace, readerPosition, readingGroupInput, scheduleEnd } from './reading-groups'

describe('reading groups (READ-40·41·45)', () => {
  it('splits a range evenly by week and clamps the last due date to the end', () => {
    const s = evenSchedule('2026-11-01', '2026-11-20', 1, 300)
    expect(s.map(x => [x.label, x.from, x.to, x.dueDate])).toEqual([
      ['1주차', 1, 100, '2026-11-07'],
      ['2주차', 101, 200, '2026-11-14'],
      ['3주차', 201, 300, '2026-11-20'],
    ])
    expect(evenSchedule('2026-11-01', '2026-12-31', 1, 3)).toHaveLength(3)
    expect(evenSchedule('2026-11-05', '2026-11-01', 1, 10)).toEqual([])
  })

  it('checks assignment by all, uid or group', () => {
    const g = { assignees: { all: false, uids: ['bob'], groupIds: ['g1'] } }
    expect(isAssigned(g, 'bob')).toBe(true)
    expect(isAssigned(g, 'mia', ['g1'])).toBe(true)
    expect(isAssigned(g, 'mia', ['g2'])).toBe(false)
    expect(isAssigned({ assignees: { all: true, uids: [], groupIds: [] } }, 'x')).toBe(true)
  })

  it('validates the period and finds this week', () => {
    const base = { bookKey: 'isbn:1', book: { title: 'A', authors: [], cover: '' }, unit: 'page', assignees: { all: true, uids: [], groupIds: [] }, joinable: true, schedule: [] }
    expect(readingGroupInput.safeParse({ ...base, startAt: '2026-11-02', endAt: '2026-11-01' }).success).toBe(false)
    expect(readingGroupInput.safeParse({ ...base, startAt: '2026-11-01', endAt: '2026-11-01' }).success).toBe(true)
    const s = evenSchedule('2026-11-01', '2026-11-20', 1, 300)
    expect(currentItem(s, '2026-11-08')?.label).toBe('2주차')
    expect(currentItem(s, '2026-12-01')).toBeNull()
  })
})

describe('progress and spoilers (READ-42·43)', () => {
  const s = evenSchedule('2026-11-01', '2026-11-28', 1, 100)
  it('expects the past items finished and the current one by elapsed days', () => {
    expect(expectedPosition(s, '2026-11-01', '2026-10-20')).toBe(0)
    expect(expectedPosition(s, '2026-11-01', '2026-11-01')).toBe(0)
    expect(expectedPosition(s, '2026-11-01', '2026-11-08')).toBe(25)
    expect(expectedPosition(s, '2026-11-01', '2026-12-10')).toBe(100)
    expect(expectedPosition([], '2026-11-01', '2026-11-08')).toBeNull()
    expect(scheduleEnd(s)).toBe(100)
  })
  it('classifies pace with a 5% band and reads the shelf position', () => {
    expect(pace(25, 25, 100)).toBe('onTrack')
    expect(pace(40, 25, 100)).toBe('ahead')
    expect(pace(10, 25, 100)).toBe('behind')
    expect(pace(10, null, 100)).toBeNull()
    expect(readerPosition({ status: 'reading', position: { page: 30 } }, 'page', 100)).toBe(30)
    expect(readerPosition({ status: 'done', position: {} }, 'page', 100)).toBe(100)
    expect(readerPosition(null, 'page', 100)).toBe(0)
  })
  it('hides chapter talk until the range is read', () => {
    expect(isSpoiler({ to: 25 }, 10, false)).toBe(true)
    expect(isSpoiler({ to: 25 }, 25, false)).toBe(false)
    expect(isSpoiler({ to: 25 }, 0, true)).toBe(false)
    expect(isSpoiler({ to: null }, 0, false)).toBe(false)
  })
})
