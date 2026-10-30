import { describe, expect, it } from 'vitest'
import { currentItem, evenSchedule, isAssigned, readingGroupInput } from './reading-groups'

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
