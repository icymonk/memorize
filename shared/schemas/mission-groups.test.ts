import { describe, expect, it } from 'vitest'
import { missionInput, participantsOf } from './mission'

describe('participantsOf with groups (WS-32)', () => {
  const base = missionInput.parse({ title: '독서', startDate: '2026-10-13' })
  it('adds active members of the picked groups to picked people, without the host', () => {
    const m = { ...base, assignees: { all: false, uids: ['u2'], groupIds: ['g1'] } }
    expect(participantsOf(m, 'u1', ['u1', 'u2', 'u3', 'u4'], { u1: ['g1'], u3: ['g1'], u4: ['g2'] }).sort()).toEqual(['u2', 'u3'])
  })
  it('old missions without groupIds still work', () => {
    expect(participantsOf({ ...base, assignees: { all: false, uids: ['u2'] } as never }, 'u1', ['u1', 'u2'])).toEqual(['u2'])
  })
})
