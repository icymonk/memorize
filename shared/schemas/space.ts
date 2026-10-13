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
  reading: true,
  reviews: true,
  missions: true,
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

export const WHO_OPTIONS = ['everyone', 'managers'] as const

/** WS-03·04 운영 방식 */
export const spaceSettingsSchema = z.object({
  joinPolicy: z.enum(['link', 'approval']),
  whoCanInvite: z.enum(WHO_OPTIONS),
  whoCanCreate: z.enum(WHO_OPTIONS),
  whoCanHost: z.enum(WHO_OPTIONS),
  progressSharing: z.enum(['everyone', 'self']),
  /** WS-06 새 학습일지의 기본 공개 범위 */
  journalVisibility: z.enum(['space', 'private']),
})
export type SpaceSettings = z.infer<typeof spaceSettingsSchema>

/** 기본은 모두 "모든 멤버" */
export const DEFAULT_SPACE_SETTINGS: SpaceSettings = {
  joinPolicy: 'link',
  whoCanInvite: 'everyone',
  whoCanCreate: 'everyone',
  whoCanHost: 'everyone',
  progressSharing: 'everyone',
  journalVisibility: 'space',
}

/** WS-01 설정 화면의 일반 항목 (규칙에서도 같은 한도를 검사한다) */
export const spaceGeneralSchema = z.object({
  name: z.string().trim().min(1).max(40),
  icon: z.string().trim().min(1).max(16),
  color: z.enum(SPACE_COLORS),
  description: z.string().trim().max(200),
})
export type SpaceGeneral = z.infer<typeof spaceGeneralSchema>

/** WS-07 */
export const scheduleSpaceDeletionInput = z.object({
  spaceId: z.string().min(1).max(128),
  confirmName: z.string(),
})
export type ScheduleSpaceDeletionInput = z.infer<typeof scheduleSpaceDeletionInput>
export const cancelSpaceDeletionInput = z.object({ spaceId: z.string().min(1).max(128) })
export type CancelSpaceDeletionInput = z.infer<typeof cancelSpaceDeletionInput>

export type SpaceAccess = 'owner' | 'manager' | 'member'
export type MemberStatus = 'active' | 'pending' | 'left' | 'removed'

/** WS-22~25 */
const spaceIdField = z.string().min(1).max(128)
export const setManagerInput = z.object({ spaceId: spaceIdField, uid: spaceIdField, manager: z.boolean() })
export type SetManagerInput = z.infer<typeof setManagerInput>
export const memberTargetInput = z.object({ spaceId: spaceIdField, uid: spaceIdField })
export type MemberTargetInput = z.infer<typeof memberTargetInput>
export const transferOwnershipInput = z.object({ spaceId: spaceIdField, uid: spaceIdField.nullable() })
export type TransferOwnershipInput = z.infer<typeof transferOwnershipInput>
export const respondOwnershipInput = z.object({ spaceId: spaceIdField, accept: z.boolean() })
export type RespondOwnershipInput = z.infer<typeof respondOwnershipInput>
