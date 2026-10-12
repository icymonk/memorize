import { z } from 'zod'

/** WS-02: 공간에서 켜고 끌 수 있는 기능 */
export const MODULE_KEYS = ['vocab', 'notes', 'reading', 'reviews', 'missions', 'tests', 'math', 'courses', 'wrongNotes'] as const
export type ModuleKey = typeof MODULE_KEYS[number]
export type Modules = Record<ModuleKey, boolean>

export const modulesSchema = z.object(Object.fromEntries(MODULE_KEYS.map(k => [k, z.boolean()])) as Record<ModuleKey, z.ZodBoolean>)

/** 새 워크스페이스의 기본 기능: 0~1단계에서 쓸 수 있는 단어 학습·노트만 켠다 */
export const DEFAULT_WORKSPACE_MODULES: Modules = {
  vocab: true,
  notes: true,
  reading: false,
  reviews: false,
  missions: false,
  tests: false,
  math: false,
  courses: false,
  wrongNotes: false,
}

export const SPACE_COLORS = ['slate', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'violet', 'pink'] as const
export type SpaceColor = typeof SPACE_COLORS[number]

export const createWorkspaceInput = z.object({
  name: z.string().trim().min(1).max(40),
  icon: z.string().trim().min(1).max(16),
  color: z.enum(SPACE_COLORS),
  description: z.string().trim().max(200).default(''),
  modules: modulesSchema.default(DEFAULT_WORKSPACE_MODULES),
})
export type CreateWorkspaceInput = z.input<typeof createWorkspaceInput>
export type CreateWorkspaceOutput = { spaceId: string }

/** WS-03·04 기본 운영 방식 (기본 모두 "모든 멤버") */
export const DEFAULT_SPACE_SETTINGS = {
  joinPolicy: 'link',
  whoCanInvite: 'everyone',
  whoCanCreate: 'everyone',
  whoCanHost: 'everyone',
  progressSharing: 'everyone',
} as const

export type SpaceAccess = 'owner' | 'manager' | 'member'
export type MemberStatus = 'active' | 'pending' | 'left' | 'removed'
