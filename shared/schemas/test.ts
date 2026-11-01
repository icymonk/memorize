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

export const testMission = z.object({
  enabled: z.boolean(),
  minScore: z.number().int().min(1).max(10_000).nullable().default(null),
})
export type TestMission = z.infer<typeof testMission>

/** TST-19·MIS-16: 연습이 아닌 응시가 미션 완료 조건을 채웠는지. 목표 점수가 있으면 채점이 끝나야 판단 */
export function meetsTestMission(m: Pick<TestMission, 'minScore'>, r: { isPractice: boolean, score: number, gradingStatus: 'done' | 'pending' }): boolean {
  if (r.isPractice) return false
  return m.minScore == null || (r.gradingStatus === 'done' && r.score >= m.minScore)
}

/** TST-10~16 시험 만들기 (임시저장 상태에서만 고친다) */
export const testInput = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(2000).default(''),
  questionRefs: z.array(z.object({ questionId: id, points: z.number().int().min(1).max(100) })).max(MAX_TEST_QUESTIONS).default([]),
  settings: testSettings.default(testSettings.parse({})),
  assignees: z.object({ all: z.boolean(), uids: z.array(id).max(200), groupIds: z.array(id).max(20).default([]) }).default({ all: true, uids: [], groupIds: [] }),
  /** TST-19 미션으로도 배정. 목표 점수가 없으면 응시(제출)만 해도 완료 */
  mission: testMission.default({ enabled: false, minScore: null }),
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

/** TST-20~23 응시 */
export const attemptRefInput = z.object({ spaceId: id, testId: id, attemptId: id })
export type AttemptRefInput = z.infer<typeof attemptRefInput>
export const startAttemptInput = z.object({ spaceId: id, testId: id })
export type StartAttemptInput = z.infer<typeof startAttemptInput>
export interface StartAttemptOutput { attemptId: string, nowMs: number }
/** 결과 공개 전이면 score는 null */
export interface SubmitAttemptOutput { score: number | null, maxScore: number, gradingStatus: 'done' | 'pending' }
export const checkAnswerInput = attemptRefInput.extend({ questionId: id })
export type CheckAnswerInput = z.infer<typeof checkAnswerInput>
export interface CheckAnswerOutput { score: number | null, points: number, answer: (number | boolean | string)[], explanation: string }

/** 시간 초과 직후 저장이 늦게 도착해도 받아 주는 여유 (ms) */
export const SUBMIT_GRACE_MS = 30_000

/** 마감 시각: 시간 제한과 시험 마감 중 이른 쪽 */
export function attemptDeadline(startMs: number, s: Pick<TestSettings, 'timeLimitMin' | 'closeAt'>): number | null {
  const byLimit = s.timeLimitMin ? startMs + s.timeLimitMin * 60_000 : null
  if (byLimit == null) return s.closeAt
  return s.closeAt == null ? byLimit : Math.min(byLimit, s.closeAt)
}

/** 지금 응시를 시작할 수 있는지. 연습 모드는 응시 횟수에 들지 않는다 */
export function canStart(t: { status: string, settings: Pick<TestSettings, 'openAt' | 'closeAt' | 'maxAttempts' | 'practice'> }, used: number, nowMs: number): 'ok' | 'notOpen' | 'closed' | 'noAttempts' {
  if (t.status === 'draft' || (t.settings.openAt != null && nowMs < t.settings.openAt)) return 'notOpen'
  if (t.status === 'closed' || (t.settings.closeAt != null && nowMs >= t.settings.closeAt)) return 'closed'
  if (!t.settings.practice && t.settings.maxAttempts > 0 && used >= t.settings.maxAttempts) return 'noAttempts'
  return 'ok'
}

/** TST-31 직접 채점: 문제별 점수(부분 점수 포함)와 코멘트 */
export const gradeAttemptInput = attemptRefInput.extend({
  scores: z.record(id, z.number().min(0).max(100)),
  comments: z.record(id, z.string().max(1000)).default({}),
})
export type GradeAttemptInput = z.infer<typeof gradeAttemptInput>
export interface GradeAttemptOutput { score: number, gradingStatus: 'done' | 'pending' }

/** 채점 반영: 진행자 점수를 덮어쓰고 총점과 채점 상태를 다시 계산 */
export function applyGrades(
  items: Record<string, { score: number | null, points: number }>,
  scores: Record<string, number>,
): { items: Record<string, { score: number | null, points: number }>, score: number, gradingStatus: 'done' | 'pending' } {
  const out: Record<string, { score: number | null, points: number }> = {}
  let score = 0
  let pending = false
  for (const [qid, it] of Object.entries(items)) {
    const given = scores[qid]
    const s = given == null ? it.score : Math.min(Math.max(0, given), it.points)
    out[qid] = { score: s, points: it.points }
    if (s == null) pending = true
    else score += s
  }
  return { items: out, score, gradingStatus: pending ? 'pending' : 'done' }
}

/** TST-14 점수 기준: 응시자별 최고 또는 마지막 (연습 제외, 채점 대기 포함) */
export function finalScores<T extends { uid: string, isPractice: boolean, score: number, submittedAtMs: number }>(results: readonly T[], scoring: 'best' | 'last'): Map<string, T> {
  const out = new Map<string, T>()
  for (const r of results) {
    if (r.isPractice) continue
    const cur = out.get(r.uid)
    if (!cur || (scoring === 'best' ? r.score > cur.score : r.submittedAtMs > cur.submittedAtMs)) out.set(r.uid, r)
  }
  return out
}
