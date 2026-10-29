import { z } from 'zod'

/** 2-E 미션 — docs/features/missions.md, docs/dev/data-model.md `spaces/{sid}/missions` */
export const MISSION_TYPES = ['check', 'submission'] as const
export const RECURRENCE = ['once', 'daily', 'weekly'] as const
export const NOTIFY_ON_COMPLETE = ['feed', 'all', 'none'] as const

const uid = z.string().min(1).max(128)
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const missionInput = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(2000).default(''),
  type: z.enum(MISSION_TYPES).default('check'),
  recurrence: z.object({
    kind: z.enum(RECURRENCE),
    weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  }).default({ kind: 'once', weekdays: [] }),
  startDate: day,
  endDate: day.nullable().default(null),
  allowLate: z.boolean().default(false),
  assignees: z.object({ all: z.boolean(), uids: z.array(uid).max(200), groupIds: z.array(uid).max(20).default([]) }).default({ all: true, uids: [], groupIds: [] }),
  includeSelf: z.boolean().default(false),
  joinable: z.boolean().default(false),
  isPersonal: z.boolean().default(false),
  notifyOnComplete: z.enum(NOTIFY_ON_COMPLETE).default('feed'),
  coHostIds: z.array(uid).max(10).default([]),
  reviewerIds: z.array(uid).max(20).default([]),
}).refine(m => !m.endDate || m.endDate >= m.startDate, { path: ['endDate'] })
  .refine(m => m.recurrence.kind !== 'weekly' || m.recurrence.weekdays.length > 0, { path: ['recurrence'] })
export type MissionInput = z.infer<typeof missionInput>

const dow = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay()

/** MIS-11: 그 날짜가 회차인지. 한 번은 기간 안 아무 날, 매일은 매일, 매주는 고른 요일 */
export function isPeriodDay(m: Pick<MissionInput, 'recurrence' | 'startDate' | 'endDate'>, date: string): boolean {
  if (date < m.startDate || (m.endDate && date > m.endDate)) return false
  return m.recurrence.kind !== 'weekly' || m.recurrence.weekdays.includes(dow(date))
}

/** 제출 문서 키(`{uid}_{periodKey}`)의 회차 부분: 한 번은 'once', 반복은 그 날짜 */
export function periodKey(m: Pick<MissionInput, 'recurrence'>, date: string): string {
  return m.recurrence.kind === 'once' ? 'once' : date
}

/** 현황판 열: from~to(포함) 사이의 회차 키. 한 번짜리는 ['once'] */
export function periodKeys(m: Pick<MissionInput, 'recurrence' | 'startDate' | 'endDate'>, from: string, to: string): string[] {
  if (m.recurrence.kind === 'once') return ['once']
  const out: string[] = []
  for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to && out.length < 400; d.setUTCDate(d.getUTCDate() + 1)) {
    const s = d.toISOString().slice(0, 10)
    if (isPeriodDay(m, s)) out.push(s)
  }
  return out
}

/** 참여자: 개인 목표는 나만. 그 외에는 대상(전체면 활성 멤버 모두, 아니면 고른 사람 + 고른 그룹의 멤버, WS-32) + "나도 참여" */
export function participantsOf(m: Pick<MissionInput, 'isPersonal' | 'includeSelf'> & { assignees: { all: boolean, uids: string[], groupIds?: string[] } }, host: string, activeMembers: string[], memberGroups: Record<string, string[]> = {}): string[] {
  if (m.isPersonal) return [host]
  const groups = m.assignees.groupIds ?? []
  const inGroups = groups.length ? activeMembers.filter(u => (memberGroups[u] ?? []).some(g => groups.includes(g))) : []
  const base = m.assignees.all ? activeMembers.filter(u => u !== host) : [...m.assignees.uids, ...inGroups].filter(u => u !== host)
  return [...new Set([...base, ...(m.includeSelf ? [host] : [])])]
}

/** MIS-22: 제출 (글 + 내 노트 선택 + 파일·사진 첨부) */
export const SUBMISSION_STATUS = ['submitted', 'approved', 'rejected', 'done'] as const
export type SubmissionStatus = typeof SUBMISSION_STATUS[number]

export const submissionInput = z.object({
  content: z.string().trim().max(5000).default(''),
  pageId: z.string().min(1).max(128).nullable().default(null),
})
export type SubmissionInput = z.infer<typeof submissionInput>

export const submissionId = (uid: string, period: string) => `${uid}_${period}`

/** 체크형은 바로 완료. 제출형은 검토할 사람(진행자·리뷰어 − 본인)이 없으면 바로 완료 (MIS-32) */
export function initialStatus(type: MissionInput['type'] | 'auto', reviewers: string[]): SubmissionStatus {
  return type === 'check' || reviewers.length === 0 ? 'done' : 'submitted'
}

/** 진행자·리뷰어 중 본인을 뺀 검토자 */
export const reviewersFor = (m: { hostIds: string[], reviewerIds: string[] }, uid: string) => [...new Set([...m.hostIds, ...m.reviewerIds])].filter(u => u !== uid)

/** MIS-23: 회차 날짜(한 번짜리는 마감일)가 지났으면 늦음 */
export function isLate(m: Pick<MissionInput, 'recurrence' | 'endDate'>, period: string, today: string): boolean {
  const due = period === 'once' ? m.endDate : period
  return !!due && today > due
}
