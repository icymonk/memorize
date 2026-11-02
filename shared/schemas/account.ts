import type { CreateGroupMissionInput, CreateGroupMissionOutput } from '../reading-groups'
import type { BookSearchInput, BookSearchOutput } from './book'
import type { CreateInviteInput, CreateInviteOutput, DecideJoinRequestInput, InviteCodeInput, InvitePreview, JoinSpaceOutput } from './invite'
import type { CancelSpaceDeletionInput, CreateWorkspaceInput, CreateWorkspaceOutput, MemberTargetInput, RespondOwnershipInput, ScheduleSpaceDeletionInput, SetManagerInput, TransferOwnershipInput } from './space'
import type { CopyContentInput, CopyContentOutput } from './copy'
import type { AttemptRefInput, CheckAnswerInput, CheckAnswerOutput, GradeAttemptInput, GradeAttemptOutput, OpenTestInput, OpenTestOutput, StartAttemptInput, StartAttemptOutput, SubmitAttemptOutput } from './test'
import type { CollectionRefInput } from './collection'
import type { LeaveFeedbackInput, RequestRewriteInput } from './feedback'
import type { GetVersionOutput, MovePageInput, PageOpOutput, PageRefInput, VersionRefInput } from './page'
import type { DeleteUploadInput, RegisterUploadInput, RegisterUploadOutput } from './upload'
import type { CheckWrongInput, CheckWrongOutput, WrongRefInput, WrongView } from '../wrong-notes'
import type { GenerateInput, GenerateOutput, GenItem, PreviewTemplateInput, SaveGeneratedInput, SaveGeneratedOutput } from '../math/generate'
import type { CheckProblemInput, DrawProblemInput, ProblemRefInput, ProblemResult, ProblemView, RevealHintOutput } from '../math/solve'
import type { SearchInput, SearchOutput } from '../search'
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
/** ACC-41 회원 탈퇴: '탈퇴'를 입력해 확인. deleteShared면 공유한 단어장·노트·파일도 지운다 */
export const deleteAccountInput = z.object({ confirm: z.literal('탈퇴'), deleteShared: z.boolean() })
export type DeleteAccountInput = z.infer<typeof deleteAccountInput>

/** ACC-40 내 데이터: 공간마다 내가 쓴 노트(블록 포함)·단어장(카드 포함)·책장·독서 기록·구절 */
export interface ExportedSpace {
  id: string
  name: string
  kind: string
  pages: Record<string, unknown>[]
  decks: Record<string, unknown>[]
  shelf: Record<string, unknown>[]
  readingLogs: Record<string, unknown>[]
  quotes: Record<string, unknown>[]
}
export interface ExportMyDataOutput { exportedAt: string, profile: Record<string, unknown>, spaces: ExportedSpace[] }

export interface Callables {
  ensureAccount: { input: EnsureAccountInput, output: EnsureAccountOutput }
  exportMyData: { input: Record<string, never>, output: ExportMyDataOutput }
  deleteAccount: { input: DeleteAccountInput, output: { ok: true } }
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
  openTest: { input: OpenTestInput, output: OpenTestOutput }
  createReadingGroupMission: { input: CreateGroupMissionInput, output: CreateGroupMissionOutput }
  startAttempt: { input: StartAttemptInput, output: StartAttemptOutput }
  submitAttempt: { input: AttemptRefInput, output: SubmitAttemptOutput }
  checkAnswer: { input: CheckAnswerInput, output: CheckAnswerOutput }
  gradeAttempt: { input: GradeAttemptInput, output: GradeAttemptOutput }
  drawProblem: { input: DrawProblemInput, output: ProblemView }
  checkProblem: { input: CheckProblemInput, output: ProblemResult }
  revealHint: { input: ProblemRefInput, output: RevealHintOutput }
  generateProblems: { input: GenerateInput, output: GenerateOutput }
  previewTemplate: { input: PreviewTemplateInput, output: GenItem }
  saveGenerated: { input: SaveGeneratedInput, output: SaveGeneratedOutput }
  drawWrong: { input: WrongRefInput, output: WrongView }
  checkWrong: { input: CheckWrongInput, output: CheckWrongOutput }
  movePage: { input: MovePageInput, output: PageOpOutput }
  trashPage: { input: PageRefInput, output: PageOpOutput }
  getVersion: { input: VersionRefInput, output: GetVersionOutput }
  restoreVersion: { input: VersionRefInput, output: PageOpOutput }
  searchAll: { input: SearchInput, output: SearchOutput }
  restorePage: { input: PageRefInput, output: PageOpOutput }
  deleteCollection: { input: CollectionRefInput, output: PageOpOutput }
  leaveFeedback: { input: LeaveFeedbackInput, output: { ok: true } }
  requestRewrite: { input: RequestRewriteInput, output: { ok: true } }
  searchBooks: { input: BookSearchInput, output: BookSearchOutput }
  registerUpload: { input: RegisterUploadInput, output: RegisterUploadOutput }
  deleteUpload: { input: DeleteUploadInput, output: { ok: true } }
}
