import { z } from 'zod'

/** READ-40·41·45 함께 읽기: 책·기간·대상·참여·챕터 일정 */
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const pos = z.number().int().min(0).max(100000).nullable()

export const scheduleItem = z.object({
  id: z.string().min(1).max(40),
  label: z.string().trim().min(1).max(40),
  from: pos,
  to: pos,
  dueDate: day,
})
export type ScheduleItem = z.infer<typeof scheduleItem>

export const readingGroupInput = z.object({
  bookKey: z.string().min(3).max(80),
  book: z.object({ title: z.string().trim().min(1).max(200), authors: z.array(z.string()).max(10), cover: z.string().max(500) }),
  unit: z.enum(['page', 'percent', 'minute']),
  startAt: day,
  endAt: day,
  assignees: z.object({ all: z.boolean(), uids: z.array(z.string()).max(200), groupIds: z.array(z.string()).max(20) }),
  joinable: z.boolean(),
  schedule: z.array(scheduleItem).max(52),
}).refine(x => x.endAt >= x.startAt, { path: ['endAt'] })
export type ReadingGroupInput = z.infer<typeof readingGroupInput>

const toDate = (d: string) => new Date(`${d}T00:00:00Z`)
export const addDays = (d: string, n: number) => new Date(toDate(d).getTime() + n * 86400000).toISOString().slice(0, 10)
export const daysBetween = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86400000)

/** READ-45 "기간에 맞춰 균등 분배": 1주씩 나눠 from~to 범위를 고르게 */
export function evenSchedule(startAt: string, endAt: string, from: number, to: number): ScheduleItem[] {
  if (endAt < startAt || to < from) return []
  const total = to - from + 1
  const weeks = Math.min(total, Math.max(1, Math.ceil((daysBetween(startAt, endAt) + 1) / 7)), 52)
  return Array.from({ length: weeks }, (_, i) => {
    const due = addDays(startAt, 7 * (i + 1) - 1)
    return {
      id: `w${i + 1}`,
      label: `${i + 1}주차`,
      from: from + Math.floor((total * i) / weeks),
      to: from + Math.floor((total * (i + 1)) / weeks) - 1,
      dueDate: i === weeks - 1 || due > endAt ? endAt : due,
    }
  })
}

/** READ-41: 대상(전체·멤버·그룹)이거나 열린 모임이면 참여할 수 있다 */
export function isAssigned(g: Pick<ReadingGroupInput, 'assignees'>, uid: string, myGroupIds: string[] = []) {
  return g.assignees.all || g.assignees.uids.includes(uid) || myGroupIds.some(x => g.assignees.groupIds.includes(x))
}

/** 오늘 읽을 일정: 마감일이 오늘 이후인 첫 일정 */
export const currentItem = (schedule: ScheduleItem[], today: string) => [...schedule].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).find(s => s.dueDate >= today) ?? null
