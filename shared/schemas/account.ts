import type { BookSearchInput, BookSearchOutput } from './book'
import type { CreateInviteInput, CreateInviteOutput, DecideJoinRequestInput, InviteCodeInput, InvitePreview, JoinSpaceOutput } from './invite'
import type { CancelSpaceDeletionInput, CreateWorkspaceInput, CreateWorkspaceOutput, MemberTargetInput, RespondOwnershipInput, ScheduleSpaceDeletionInput, SetManagerInput, TransferOwnershipInput } from './space'
import type { CopyContentInput, CopyContentOutput } from './copy'
import type { CollectionRefInput } from './collection'
import type { LeaveFeedbackInput } from './feedback'
import type { MovePageInput, PageOpOutput, PageRefInput } from './page'
import { z } from 'zod'

export const personalSpaceId = (uid: string) => `p_${uid}`

export const ensureAccountInput = z.object({
  timezone: z.string().min(1).max(64),
  locale: z.string().min(2).max(16),
})
export type EnsureAccountInput = z.infer<typeof ensureAccountInput>

export const ensureAccountOutput = z.object({
  created: z.boolean(),
  needsOnboarding: z.boolean(),
  personalSpaceId: z.string(),
})
export type EnsureAccountOutput = z.infer<typeof ensureAccountOutput>

export const completeOnboardingInput = z.object({
  displayName: z.string().trim().min(1).max(30),
  timezone: z.string().min(1).max(64),
})
export type CompleteOnboardingInput = z.infer<typeof completeOnboardingInput>

/** callable 이름 → 입력·출력 타입 (앱의 callFn과 서버가 함께 쓴다) */
export interface Callables {
  ensureAccount: { input: EnsureAccountInput, output: EnsureAccountOutput }
  completeOnboarding: { input: CompleteOnboardingInput, output: { ok: true } }
  createWorkspace: { input: CreateWorkspaceInput, output: CreateWorkspaceOutput }
  scheduleSpaceDeletion: { input: ScheduleSpaceDeletionInput, output: { deleteScheduledAt: string } }
  cancelSpaceDeletion: { input: CancelSpaceDeletionInput, output: { ok: true } }
  createInvite: { input: CreateInviteInput, output: CreateInviteOutput }
  getInvite: { input: InviteCodeInput, output: InvitePreview }
  joinSpace: { input: InviteCodeInput, output: JoinSpaceOutput }
  decideJoinRequest: { input: DecideJoinRequestInput, output: { ok: true } }
  setManager: { input: SetManagerInput, output: { ok: true } }
  removeMember: { input: MemberTargetInput, output: { ok: true } }
  leaveSpace: { input: CancelSpaceDeletionInput, output: { ok: true } }
  transferOwnership: { input: TransferOwnershipInput, output: { ok: true } }
  respondOwnership: { input: RespondOwnershipInput, output: { ok: true } }
  copyContent: { input: CopyContentInput, output: CopyContentOutput }
  movePage: { input: MovePageInput, output: PageOpOutput }
  trashPage: { input: PageRefInput, output: PageOpOutput }
  restorePage: { input: PageRefInput, output: PageOpOutput }
  deleteCollection: { input: CollectionRefInput, output: PageOpOutput }
  leaveFeedback: { input: LeaveFeedbackInput, output: { ok: true } }
  searchBooks: { input: BookSearchInput, output: BookSearchOutput }
}
