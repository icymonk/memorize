import { z } from 'zod'

/** CMN-24 기본 스탬프. 워크스페이스 스탬프 꾸미기(CMN-26)는 나중에 */
export const STAMPS = ['great', 'good', 'effort', 'again'] as const
export type Stamp = typeof STAMPS[number]
export const STAMP_LABELS: Record<Stamp, string> = {
  great: '💮 참 잘했어요',
  good: '👍 잘했어요',
  effort: '💪 노력했어요',
  again: '🔁 다시 해 봐요',
}

const id = z.string().min(1).max(128)

/** CMN-24·25 피드백 남기기: 요청받은 사람이 스탬프와 총평을 남긴다. 다시 남기면 고쳐진다 */
export const leaveFeedbackInput = z.object({
  spaceId: id,
  pageId: id,
  stamp: z.enum(STAMPS),
  body: z.string().trim().max(2000),
})
export type LeaveFeedbackInput = z.infer<typeof leaveFeedbackInput>

export const feedbackId = (pageId: string, uid: string) => `fb_${pageId}_${uid}`
