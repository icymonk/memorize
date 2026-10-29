import { z } from 'zod'

/** MATH-10·13 문제집 — docs/dev/data-model.md 10절 */
export const PROBLEM_SET_MAX_QUESTIONS = 100

export const problemSetInput = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).default(''),
  grade: z.string().max(10).nullable().default(null),
  unit: z.object({ code: z.string().max(40).nullable(), custom: z.string().trim().max(60).nullable() }).nullable().default(null),
  visibility: z.enum(['private', 'space']).default('private'),
  /** members: 공개 문제집에 다른 멤버도 문제를 넣고 뺀다 */
  editPolicy: z.enum(['owner', 'members']).default('owner'),
}).transform(v => ({ ...v, editPolicy: v.visibility === 'space' ? v.editPolicy : 'owner' as const }))
export type ProblemSetInput = z.infer<typeof problemSetInput>
