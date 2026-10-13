import { z } from 'zod'

const id = z.string().min(1).max(128)

export const RESULT_RELEASE = ['instant', 'afterClose', 'scoreOnly', 'hidden'] as const
export type ResultRelease = (typeof RESULT_RELEASE)[number]
export const TEST_STATUS = ['draft', 'open', 'closed'] as const
export type TestStatus = (typeof TEST_STATUS)[number]
export const MAX_TEST_QUESTIONS = 100
/** 응시 횟수 0은 무제한 */
export const MAX_ATTEMPTS = 10

export const testSettings = z.object({
  timeLimitMin: z.number().int().min(1).max(300).nullable().default(null),
  openAt: z.number().int().nullable().default(null),
  closeAt: z.number().int().nullable().default(null),
  maxAttempts: z.number().int().min(0).max(MAX_ATTEMPTS).default(1),
  scoring: z.enum(['best', 'last']).default('best'),
  shuffleQuestions: z.boolean().default(false),
  shuffleChoices: z.boolean().default(false),
  resultRelease: z.enum(RESULT_RELEASE).default('instant'),
  practice: z.boolean().default(false),
}).refine(s => s.openAt == null || s.closeAt == null || s.closeAt > s.openAt, { message: 'closeAt', path: ['closeAt'] })
export type TestSettings = z.infer<typeof testSettings>

/** TST-10~16 시험 만들기 (임시저장 상태에서만 고친다) */
export const testInput = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(2000).default(''),
  questionRefs: z.array(z.object({ questionId: id, points: z.number().int().min(1).max(100) })).max(MAX_TEST_QUESTIONS).default([]),
  settings: testSettings.default(testSettings.parse({})),
  assignees: z.object({ all: z.boolean(), uids: z.array(id).max(200), groupIds: z.array(id).max(20).default([]) }).default({ all: true, uids: [], groupIds: [] }),
})
export type TestInput = z.infer<typeof testInput>

export const openTestInput = z.object({ spaceId: id, testId: id })
export type OpenTestInput = z.infer<typeof openTestInput>
export interface OpenTestOutput { questionCount: number, maxScore: number, takerCount: number }

/** 시험지에 들어가는 문제 사본. 정답은 넣지 않는다 */
export interface PaperItem {
  questionId: string
  type: 'single' | 'multi' | 'ox' | 'short' | 'essay'
  prompt: string
  choices: string[]
  media: { id: string, name: string, path: string, contentType: string, size: number }[]
  points: number
}

/** TST-16 대상자: 전체면 진행자를 뺀 활성 멤버, 아니면 고른 멤버와 그룹 멤버 */
export function testTakers(assignees: TestInput['assignees'], hostIds: readonly string[], active: readonly string[], memberGroups: Record<string, string[]> = {}): string[] {
  const hosts = new Set(hostIds)
  const activeSet = new Set(active)
  const groups = new Set(assignees.groupIds)
  const picked = assignees.all
    ? active
    : [...assignees.uids, ...active.filter(u => (memberGroups[u] ?? []).some(g => groups.has(g)))]
  return [...new Set(picked)].filter(u => activeSet.has(u) && !hosts.has(u))
}

/** 시험지 총점 */
export const maxScoreOf = (refs: readonly { points: number }[]) => refs.reduce((s, r) => s + r.points, 0)
