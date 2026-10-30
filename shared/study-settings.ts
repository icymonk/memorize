import { z } from 'zod'
import { DAILY_LIMITS } from './srs'

/** ACC-24 학습 설정 (users/{uid}.study): 하루 새 카드·복습 카드 상한, 낱말카드 처음 보이는 면 */
export const STUDY_LIMITS = { newMax: 200, reviewMin: 10, reviewMax: 1000 } as const
export const studySettings = z.object({
  dailyNewCards: z.number().int().min(0).max(STUDY_LIMITS.newMax),
  dailyReviewCards: z.number().int().min(STUDY_LIMITS.reviewMin).max(STUDY_LIMITS.reviewMax),
  flashcardFront: z.enum(['front', 'back']),
})
export type StudySettings = z.infer<typeof studySettings>
export const DEFAULT_STUDY: StudySettings = { dailyNewCards: DAILY_LIMITS.newCards, dailyReviewCards: DAILY_LIMITS.reviewCards, flashcardFront: 'front' }

/** 저장된 값 중 올바른 것만 쓰고 나머지는 기본값 */
export function readStudySettings(raw: unknown): StudySettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out = { ...DEFAULT_STUDY }
  for (const k of Object.keys(DEFAULT_STUDY) as (keyof StudySettings)[]) {
    const v = studySettings.shape[k].safeParse(r[k])
    if (v.success) (out as Record<string, unknown>)[k] = v.data
  }
  return out
}
