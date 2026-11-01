import { z } from 'zod'
import { givenAnswer } from './math/solve'

/** WRN-20~22 오답 다시 풀기 — 서버(drawWrong·checkWrong)와 앱이 함께 쓴다 */
export const RESOLVE_STREAK = 2
export const OFTEN_WRONG = 3
const id = z.string().min(1).max(300)
export const wrongRefInput = z.object({ spaceId: z.string().min(1).max(128), noteId: id })
export type WrongRefInput = z.infer<typeof wrongRefInput>
export const checkWrongInput = wrongRefInput.extend({ answer: givenAnswer })
export type CheckWrongInput = z.infer<typeof checkWrongInput>

export interface WrongView {
  noteId: string
  refType: 'card' | 'question'
  /** 카드: 뜻을 보고 단어 쓰기. 문제: 원래 형태 */
  type: 'card' | 'single' | 'multi' | 'ox' | 'short' | 'essay'
  prompt: string
  choices: string[]
  /** 원본이 지워져 채점할 수 없음 (직접 해결만) */
  missing: boolean
}
export interface CheckWrongOutput { correct: boolean, consecutiveCorrect: number, resolved: boolean, answer: string | null, explanation: string | null }

/** 연속 2번 맞히면 해결, 틀리면 연속 기록을 0으로 */
export function nextStreak(cur: number, correct: boolean) {
  const consecutiveCorrect = correct ? cur + 1 : 0
  return { consecutiveCorrect, resolved: consecutiveCorrect >= RESOLVE_STREAK }
}
