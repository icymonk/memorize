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
