import { z } from 'zod'
import { seededRandom } from './template'

/** MATH-15 단원별 만들기 — 서버(generateProblems·previewTemplate·saveGenerated)와 앱이 함께 쓴다 */
const id = z.string().min(1).max(128)
export const GEN_COUNTS = [5, 10, 20] as const
export const GEN_MAX = 20
export const genSource = z.object({ kind: z.enum(['builtin', 'question']), id })
export type GenSource = z.infer<typeof genSource>
export const genFormat = z.enum(['short', 'choice', 'mix'])
export type GenFormat = z.infer<typeof genFormat>
export const genDifficulty = z.enum(['any', 'easy', 'normal', 'hard'])

export const generateInput = z.object({
  spaceId: id,
  unitCode: z.string().min(2).max(40),
  difficulty: genDifficulty.default('any'),
  count: z.number().int().refine(n => (GEN_COUNTS as readonly number[]).includes(n)),
  format: genFormat.default('mix'),
  seed: z.number().int().min(0).max(2 ** 32 - 1),
})
export type GenerateInput = z.input<typeof generateInput>
export const previewTemplateInput = z.object({ spaceId: id, source: genSource, choice: z.boolean(), seed: z.number().int().min(0).max(2 ** 32 - 1) })
export type PreviewTemplateInput = z.infer<typeof previewTemplateInput>
export const saveGeneratedInput = z.object({
  spaceId: id,
  items: z.array(z.object({ source: genSource, choice: z.boolean() })).min(1).max(GEN_MAX),
  /** 기존 문제집에 넣기 또는 새 문제집 만들기 */
  setId: id.nullable().default(null),
  title: z.string().trim().min(1).max(80).nullable().default(null),
  unitCode: z.string().min(2).max(40).nullable().default(null),
  share: z.boolean().default(false),
}).refine(v => v.setId || v.title, { message: 'setId or title' })
export type SaveGeneratedInput = z.input<typeof saveGeneratedInput>

/** 미리보기 문제 하나. answer는 내장 틀·내 틀·정답 공개 틀만 */
export interface GenItem {
  source: GenSource
  name: string
  unit: string
  canChoice: boolean
  choice: boolean
  seed: number
  prompt: string
  choices: string[]
  answer: string | null
}
export interface GenerateOutput { items: GenItem[], pool: { builtin: number, workspace: number }, relaxed: boolean }
export interface SaveGeneratedOutput { setId: string, added: number }

export interface PoolEntry { difficulty: string, canChoice: boolean }

/**
 * 틀을 섞어 돌아가며 count개를 고른다 (틀이 모자라면 다시 돌며 숫자만 다르게).
 * 고른 난이도의 틀이 없으면 전체에서 고르고 relaxed=true
 */
export function pickTemplates<T extends PoolEntry>(pool: T[], opts: { difficulty: string, count: number, format: GenFormat, seed: number }) {
  const rand = seededRandom(opts.seed)
  const exact = opts.difficulty === 'any' ? pool : pool.filter(p => p.difficulty === opts.difficulty)
  const relaxed = opts.difficulty !== 'any' && !exact.length && pool.length > 0
  const base = exact.length ? exact : pool
  const out: { entry: T, choice: boolean, seed: number }[] = []
  if (!base.length) return { picks: out, relaxed }
  let order: T[] = []
  for (let i = 0; i < opts.count; i++) {
    if (!order.length) {
      order = [...base]
      for (let j = order.length - 1; j > 0; j--) {
        const k = Math.floor(rand() * (j + 1))
        ;[order[j], order[k]] = [order[k]!, order[j]!]
      }
    }
    const entry = order.shift()!
    const want = opts.format === 'choice' || (opts.format === 'mix' && i % 2 === 1)
    out.push({ entry, choice: want && entry.canChoice, seed: Math.floor(rand() * 2 ** 32) })
  }
  return { picks: out, relaxed }
}
