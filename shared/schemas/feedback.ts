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

/** CMN-24 점수: 워크스페이스 설정에서 켜면 스탬프와 함께. 형식은 남길 때의 것을 함께 저장한다 */
export const SCORE_FORMATS = ['100', 'grade', 'stars'] as const
export type ScoreFormat = typeof SCORE_FORMATS[number]
export const GRADES = ['A', 'B', 'C', 'D', 'F'] as const
export const feedbackScore = z.discriminatedUnion('format', [
  z.object({ format: z.literal('100'), value: z.number().int().min(0).max(100) }),
  z.object({ format: z.literal('grade'), value: z.enum(GRADES) }),
  z.object({ format: z.literal('stars'), value: z.number().int().min(1).max(5) }),
])
export type FeedbackScore = z.infer<typeof feedbackScore>

export function formatScore(s: FeedbackScore) {
  if (s.format === '100') return `${s.value}점`
  if (s.format === 'grade') return s.value
  return '★'.repeat(s.value) + '☆'.repeat(5 - s.value)
}

const id = z.string().min(1).max(128)

/** CMN-24·25 피드백 남기기: 요청받은 사람이 스탬프와 총평을 남긴다. 다시 남기면 고쳐진다 */
export const leaveFeedbackInput = z.object({
  spaceId: id,
  pageId: id,
  stamp: z.enum(STAMPS),
  body: z.string().trim().max(2000),
  score: feedbackScore.nullable().default(null),
})
export type LeaveFeedbackInput = z.infer<typeof leaveFeedbackInput>

/** REV-14 다시 쓰기 요청: 요청받은 사람이 고칠 점을 적어 보내면 독후감이 임시저장으로 돌아간다 */
export const requestRewriteInput = z.object({
  spaceId: id,
  pageId: id,
  reason: z.string().trim().max(500).default(''),
})
export type RequestRewriteInput = z.input<typeof requestRewriteInput>

export const feedbackId = (pageId: string, uid: string) => `fb_${pageId}_${uid}`
