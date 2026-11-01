import type { QuestionType } from '../schemas/question'
import { z } from 'zod'
import { gradeAnswer } from '../schemas/question'
import { drawProblem, templateInput } from './template'

/** MATH-20~24 문제집 풀기 — 서버(drawProblem·checkProblem·revealHint)와 앱이 함께 쓴다 */
const id = z.string().min(1).max(128)
export const problemRefInput = z.object({ spaceId: id, setId: id, questionId: id })
export type ProblemRefInput = z.infer<typeof problemRefInput>
/** fresh: 처음부터 다시 (변형 문제는 새 숫자) */
export const drawProblemInput = problemRefInput.extend({ fresh: z.boolean().default(false) })
export type DrawProblemInput = z.input<typeof drawProblemInput>
export const givenAnswer = z.union([z.array(z.number().int().min(0).max(10)).max(10), z.boolean(), z.string().max(2000)])
/** giveUp: 포기하고 정답·해설 보기 */
export const checkProblemInput = problemRefInput.extend({ answer: givenAnswer.nullable().default(null), giveUp: z.boolean().default(false) })
export type CheckProblemInput = z.input<typeof checkProblemInput>

export type KeyValue = number | boolean | string
/** 맞혔거나 포기했으면 정답·해설을 함께 돌려준다 */
export interface ProblemResult {
  tries: number
  done: boolean
  correct: boolean | null
  gaveUp: boolean
  /** 100점 만점, 힌트 감점 반영. 끝나기 전·서술형은 null */
  score: number | null
  answer: KeyValue[] | null
  explanation: string | null
}
export interface ProblemView extends ProblemResult {
  questionId: string
  type: QuestionType
  prompt: string
  choices: string[]
  media: { id: string, name: string, path: string, contentType: string, size: number }[]
  variant: boolean
  /** 내가 만든 문제: 연습으로 기록 (통계 제외) */
  isPractice: boolean
  hintCount: number
  hints: string[]
  lastAnswer: KeyValue[] | KeyValue | null
}
export interface RevealHintOutput { hints: string[], hintCount: number }

export interface StoredQuestion { type: QuestionType, prompt: string, choices?: string[], variant?: boolean }
export interface StoredKey {
  answer?: KeyValue[]
  ignoreCase?: boolean
  ignoreSpaces?: boolean
  explanation?: string
  tolerance?: number | null
  template?: unknown
  hints?: string[]
}
export interface Resolved {
  prompt: string
  choices: string[]
  hints: string[]
  explanation: string
  key: { answer: KeyValue[], ignoreCase: boolean, ignoreSpaces: boolean, tolerance: number | null }
}

/** 변형 문제는 seed로 숫자를 채운 문제를, 일반 문제는 저장된 문제를 정답과 함께 만든다 (서버 전용 결과) */
export function resolveProblem(q: StoredQuestion, k: StoredKey | null, seed: number | null): Resolved {
  const base = {
    ignoreCase: k?.ignoreCase ?? true,
    ignoreSpaces: k?.ignoreSpaces ?? false,
    tolerance: k?.tolerance ?? null,
  }
  const tpl = q.variant && k?.template && seed != null ? templateInput.safeParse(k.template) : null
  if (tpl?.success) {
    const choice = q.type === 'single'
    const r = drawProblem(tpl.data, seed!, choice)
    if (r.ok) {
      return {
        prompt: r.problem.prompt,
        choices: choice ? r.problem.choices : [],
        hints: r.problem.hints,
        explanation: r.problem.explanation,
        key: { ...base, answer: choice ? [r.problem.answerIndex] : [r.problem.answer], tolerance: choice ? null : base.tolerance ?? 0 },
      }
    }
  }
  return {
    prompt: q.prompt,
    choices: q.choices ?? [],
    hints: k?.hints ?? [],
    explanation: k?.explanation ?? '',
    key: { ...base, answer: k?.answer ?? [] },
  }
}

/** 힌트 감점: 힌트 하나에 penalty점씩, 0점 아래로는 안 내려간다 */
export const hintScore = (hintsUsed: number, penalty: number) => Math.max(0, 100 - hintsUsed * penalty)

/** 채점: 맞으면 true, 틀리면 false, 서술형은 null (스스로 확인) */
export function judge(type: QuestionType, r: Resolved, given: unknown): boolean | null {
  const s = gradeAnswer(type, r.key, given, 100)
  return s == null ? null : s > 0
}
