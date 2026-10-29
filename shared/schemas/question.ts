import { z } from 'zod'
import { parseNumber, sameNumber } from '../math/number'
import { templateInput } from '../math/template'

/** TST-01·02 문제 은행 — docs/dev/data-model.md 10절. 정답은 questionKeys에 따로 둔다 */
export const QUESTION_TYPES = ['single', 'multi', 'ox', 'short', 'essay'] as const
export type QuestionType = (typeof QUESTION_TYPES)[number]
export const QUESTION_DIFFICULTY = ['easy', 'normal', 'hard'] as const
export const CHOICES = { min: 2, max: 6 } as const
export const MAX_MEDIA = 5

const text = (max: number) => z.string().trim().max(max)

const media = z.object({
  id: z.string().min(1).max(128),
  name: z.string().max(200),
  path: z.string().min(1).max(500),
  contentType: z.string().max(200),
  size: z.number().int().min(0),
})

export const questionInput = z.object({
  type: z.enum(QUESTION_TYPES),
  prompt: text(2000).min(1),
  choices: z.array(text(300).min(1)).max(CHOICES.max).default([]),
  tags: z.array(text(20).min(1)).max(10).default([]),
  subjectId: z.string().max(64).nullable().default(null),
  media: z.array(media).max(MAX_MEDIA).default([]),
  difficulty: z.enum(QUESTION_DIFFICULTY).default('normal'),
  defaultPoints: z.number().int().min(1).max(100).default(10),
  sharing: z.enum(['private', 'space']).default('private'),
  answerVisibility: z.enum(['authors', 'space']).default('authors'),
  /** MATH-13 학년·단원: 교육과정 목록의 code 또는 자유 입력 */
  unit: z.object({ code: z.string().max(40).nullable(), custom: text(60).nullable() }).nullable().default(null),
  /** MATH-14 변형 문제: 지문·보기는 목록용 예시, 틀은 정답 문서(template)에 */
  variant: z.boolean().default(false),
})
export type QuestionInput = z.infer<typeof questionInput>

/** answer: 객관식은 보기 번호(0부터), OX는 [true|false], 단답은 허용 답 목록, 서술형은 [] */
export const questionKeyInput = z.object({
  answer: z.array(z.union([z.number().int().min(0), z.boolean(), text(200).min(1)])).max(20),
  ignoreCase: z.boolean().default(true),
  ignoreSpaces: z.boolean().default(false),
  explanation: text(2000).default(''),
  rubric: text(2000).default(''),
  /** MATH-12 단답형 숫자 정답: null이면 글자로, 숫자면 그만큼의 오차까지 정답 (분수=소수) */
  tolerance: z.number().min(0).max(1_000_000).nullable().default(null),
  template: templateInput.nullable().default(null),
})
export type QuestionKeyInput = z.infer<typeof questionKeyInput>

/** 유형에 맞는 보기·정답인지 */
export function keyFits(q: Pick<QuestionInput, 'type' | 'choices'>, k: Pick<QuestionKeyInput, 'answer'> & { tolerance?: number | null }): boolean {
  const a = k.answer
  switch (q.type) {
    case 'single':
    case 'multi': {
      const ok = q.choices.length >= CHOICES.min && a.length >= 1 && a.every(v => typeof v === 'number' && v >= 0 && v < q.choices.length) && new Set(a).size === a.length
      return ok && (q.type === 'multi' || a.length === 1)
    }
    case 'ox': return q.choices.length === 0 && a.length === 1 && typeof a[0] === 'boolean'
    case 'short': return q.choices.length === 0 && a.length >= 1 && a.every(v => typeof v === 'string' && (k.tolerance == null || parseNumber(v) != null))
    case 'essay': return q.choices.length === 0 && a.length === 0
  }
}

function norm(s: string, k: Pick<QuestionKeyInput, 'ignoreCase' | 'ignoreSpaces'>) {
  let v = s.normalize('NFC').trim().replace(/\s+/g, ' ')
  if (k.ignoreCase) v = v.toLowerCase()
  if (k.ignoreSpaces) v = v.replace(/\s/g, '')
  return v
}

/** TST-30 자동 채점. 서술형은 null (직접 채점) */
export function gradeAnswer(type: QuestionType, key: Pick<QuestionKeyInput, 'answer' | 'ignoreCase' | 'ignoreSpaces'> & { tolerance?: number | null }, given: unknown, points: number): number | null {
  switch (type) {
    case 'single':
    case 'multi': {
      if (!Array.isArray(given)) return 0
      const want = [...key.answer].map(Number).sort()
      const got = [...new Set(given.map(Number))].sort()
      return want.length === got.length && want.every((v, i) => v === got[i]) ? points : 0
    }
    case 'ox': return given === key.answer[0] ? points : 0
    case 'short': {
      if (typeof given !== 'string' || !given.trim()) return 0
      if (key.tolerance != null) {
        const g = parseNumber(given)
        return g != null && key.answer.some(a => typeof a === 'string' && parseNumber(a) != null && sameNumber(g, parseNumber(a)!, key.tolerance!)) ? points : 0
      }
      const g = norm(given, key)
      return key.answer.some(a => typeof a === 'string' && norm(a, key) === g) ? points : 0
    }
    case 'essay': return null
  }
}
