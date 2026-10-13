import { z } from 'zod'

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
})
export type QuestionInput = z.infer<typeof questionInput>

/** answer: 객관식은 보기 번호(0부터), OX는 [true|false], 단답은 허용 답 목록, 서술형은 [] */
export const questionKeyInput = z.object({
  answer: z.array(z.union([z.number().int().min(0), z.boolean(), text(200).min(1)])).max(20),
  ignoreCase: z.boolean().default(true),
  ignoreSpaces: z.boolean().default(false),
  explanation: text(2000).default(''),
  rubric: text(2000).default(''),
})
export type QuestionKeyInput = z.infer<typeof questionKeyInput>

/** 유형에 맞는 보기·정답인지 */
export function keyFits(q: Pick<QuestionInput, 'type' | 'choices'>, k: Pick<QuestionKeyInput, 'answer'>): boolean {
  const a = k.answer
  switch (q.type) {
    case 'single':
    case 'multi': {
      const ok = q.choices.length >= CHOICES.min && a.length >= 1 && a.every(v => typeof v === 'number' && v < q.choices.length) && new Set(a).size === a.length
      return ok && (q.type === 'multi' || a.length === 1)
    }
    case 'ox': return q.choices.length === 0 && a.length === 1 && typeof a[0] === 'boolean'
    case 'short': return q.choices.length === 0 && a.length >= 1 && a.every(v => typeof v === 'string')
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
export function gradeAnswer(type: QuestionType, key: Pick<QuestionKeyInput, 'answer' | 'ignoreCase' | 'ignoreSpaces'>, given: unknown, points: number): number | null {
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
      const g = norm(given, key)
      return key.answer.some(a => typeof a === 'string' && norm(a, key) === g) ? points : 0
    }
    case 'essay': return null
  }
}
