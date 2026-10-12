import type { MemberStatus, SpaceAccess, SpaceSettings } from './schemas/space'

/** 운영 권한 판정 (docs/dev/architecture.md 6절 `can`). 규칙·서버 기능과 같은 기준 */
export interface SpaceContext {
  kind: 'workspace' | 'personal'
  settings?: Partial<SpaceSettings>
  member: { access: SpaceAccess, status: MemberStatus } | null
}

export type SpaceAction = 'manage' | 'delete' | 'invite' | 'create' | 'host'

const SETTING_KEY = { invite: 'whoCanInvite', create: 'whoCanCreate', host: 'whoCanHost' } as const

export function can(ctx: SpaceContext, action: SpaceAction): boolean {
  const m = ctx.member
  if (!m || m.status !== 'active') return false
  const isManager = m.access === 'owner' || m.access === 'manager'
  if (ctx.kind === 'personal') return action === 'create'
  switch (action) {
    case 'manage':
      return isManager
    case 'delete':
      return m.access === 'owner'
    default:
      return isManager || (ctx.settings?.[SETTING_KEY[action]] ?? 'everyone') === 'everyone'
  }
}

/** 공유 콘텐츠(단어장 등) 판정 — docs/dev/security.md 3절. 규칙과 같은 기준 */
export interface ContentDoc {
  createdBy: string
  visibility: 'private' | 'group' | 'space'
  groupIds: string[]
  editPolicy: 'author' | 'collaborators' | 'everyone'
  collaboratorIds: string[]
}

export function canSeeContent(d: ContentDoc, uid: string, myGroupIds: string[] = []): boolean {
  return d.visibility === 'space' || d.createdBy === uid
    || (d.visibility === 'group' && d.groupIds.some(g => myGroupIds.includes(g)))
}

/** VOC-02 편집 범위 */
export function canEditContent(d: ContentDoc, uid: string): boolean {
  return d.createdBy === uid
    || (d.editPolicy === 'collaborators' && d.collaboratorIds.includes(uid))
    || d.editPolicy === 'everyone'
}

export function canDeleteContent(ctx: SpaceContext, d: ContentDoc, uid: string): boolean {
  const m = ctx.member
  if (!m || m.status !== 'active') return false
  return d.createdBy === uid || m.access === 'owner' || m.access === 'manager'
}
