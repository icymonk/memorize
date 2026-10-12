import { describe, expect, it } from 'vitest'
import { can } from './permissions'

const ws = (access: 'owner' | 'manager' | 'member', settings = {}, status: 'active' | 'left' = 'active') =>
  ({ kind: 'workspace' as const, settings, member: { access, status } })

describe('can', () => {
  it('manage: owner and manager only', () => {
    expect(can(ws('owner'), 'manage')).toBe(true)
    expect(can(ws('manager'), 'manage')).toBe(true)
    expect(can(ws('member'), 'manage')).toBe(false)
  })

  it('delete: owner only', () => {
    expect(can(ws('owner'), 'delete')).toBe(true)
    expect(can(ws('manager'), 'delete')).toBe(false)
  })

  it('invite/create/host follow settings', () => {
    expect(can(ws('member'), 'invite')).toBe(true)
    expect(can(ws('member', { whoCanInvite: 'managers' }), 'invite')).toBe(false)
    expect(can(ws('manager', { whoCanInvite: 'managers' }), 'invite')).toBe(true)
    expect(can(ws('member', { whoCanCreate: 'managers' }), 'create')).toBe(false)
    expect(can(ws('member', { whoCanHost: 'managers' }), 'host')).toBe(false)
  })

  it('inactive or missing member can do nothing', () => {
    expect(can(ws('owner', {}, 'left'), 'manage')).toBe(false)
    expect(can({ kind: 'workspace', member: null }, 'create')).toBe(false)
  })

  it('personal space: only create', () => {
    const p = { kind: 'personal' as const, member: { access: 'owner' as const, status: 'active' as const } }
    expect(can(p, 'create')).toBe(true)
    expect(can(p, 'manage')).toBe(false)
    expect(can(p, 'delete')).toBe(false)
    expect(can(p, 'invite')).toBe(false)
  })
})
