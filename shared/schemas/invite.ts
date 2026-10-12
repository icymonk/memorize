import { z } from 'zod'

/** WS-10·11: 초대 링크와 6자리 코드는 같은 값이다 (/invite/{code}). 헷갈리는 글자(0 O 1 I)는 뺀다 */
export const INVITE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const INVITE_CODE_LENGTH = 6
export const INVITE_EXPIRY_DAYS = [1, 7, 30] as const

export const normalizeInviteCode = (code: string) => code.trim().toUpperCase()

export const inviteCodeSchema = z.string().transform(normalizeInviteCode).pipe(
  z.string().length(INVITE_CODE_LENGTH).regex(new RegExp(`^[${INVITE_CODE_ALPHABET}]+$`)),
)

export const createInviteInput = z.object({
  spaceId: z.string().min(1).max(128),
  expiresInDays: z.union([z.literal(1), z.literal(7), z.literal(30)]).nullable().default(7),
  maxUses: z.number().int().min(1).max(1000).nullable().default(null),
})
export type CreateInviteInput = z.input<typeof createInviteInput>
export type CreateInviteOutput = { code: string }

export const inviteCodeInput = z.object({ code: inviteCodeSchema })
export type InviteCodeInput = z.input<typeof inviteCodeInput>

/** 초대 화면에서 보여줄 공간 정보. 멤버가 아니어도 볼 수 있는 최소한만 */
export type InviteStatus = 'ok' | 'member' | 'pending' | 'unavailable' | 'full'
export interface InvitePreview {
  status: InviteStatus
  spaceId: string | null
  name: string
  icon: string | null
  color: string | null
  description: string
  memberCount: number
  joinPolicy: 'link' | 'approval'
}

export type JoinSpaceOutput = { spaceId: string, status: 'active' | 'pending' }

export const decideJoinRequestInput = z.object({
  spaceId: z.string().min(1).max(128),
  uid: z.string().min(1).max(128),
  approve: z.boolean(),
})
export type DecideJoinRequestInput = z.infer<typeof decideJoinRequestInput>
