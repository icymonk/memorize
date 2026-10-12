import { describe, expect, it } from 'vitest'
import { can, canDeleteContent, canEditContent, canSeeContent } from './permissions'

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

describe('content (VOC-02, security.md 3절)', () => {
  const d = (over = {}) => ({ createdBy: 'bob', visibility: 'space' as const, groupIds: [], editPolicy: 'author' as const, collaboratorIds: [], ...over })
  it('canSeeContent', () => {
    expect(canSeeContent(d(), 'alice')).toBe(true)
    expect(canSeeContent(d({ visibility: 'private' }), 'alice')).toBe(false)
    expect(canSeeContent(d({ visibility: 'private' }), 'bob')).toBe(true)
    expect(canSeeContent(d({ visibility: 'group', groupIds: ['g1'] }), 'alice', ['g1'])).toBe(true)
    expect(canSeeContent(d({ visibility: 'group', groupIds: ['g1'] }), 'alice', ['g2'])).toBe(false)
  })
  it('canEditContent', () => {
    expect(canEditContent(d(), 'bob')).toBe(true)
    expect(canEditContent(d(), 'alice')).toBe(false)
    expect(canEditContent(d({ editPolicy: 'collaborators', collaboratorIds: ['alice'] }), 'alice')).toBe(true)
    expect(canEditContent(d({ editPolicy: 'collaborators', collaboratorIds: ['mia'] }), 'alice')).toBe(false)
    expect(canEditContent(d({ editPolicy: 'everyone' }), 'alice')).toBe(true)
  })
  it('canDeleteContent: author or manager', () => {
    expect(canDeleteContent(ws('member'), d(), 'bob')).toBe(true)
    expect(canDeleteContent(ws('member'), d(), 'alice')).toBe(false)
    expect(canDeleteContent(ws('manager'), d(), 'mia')).toBe(true)
    expect(canDeleteContent(ws('owner', {}, 'left'), d(), 'bob')).toBe(false)
  })
})
