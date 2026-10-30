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

export type Pace = 'ahead' | 'onTrack' | 'behind'

/** 일정의 마지막 위치 (진행률 막대의 끝) */
export const scheduleEnd = (schedule: ScheduleItem[]) => Math.max(0, ...schedule.map(s => s.to ?? 0)) || null

/** READ-42 오늘까지 읽었어야 할 위치: 지난 일정은 끝까지, 이번 일정은 지난 날수만큼 */
export function expectedPosition(schedule: ScheduleItem[], startAt: string, today: string): number | null {
  const items = schedule.filter(s => s.to != null).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  if (!items.length) return null
  let prevTo = Math.max(0, (items[0]!.from ?? 1) - 1)
  let winStart = startAt
  for (const s of items) {
    if (today > s.dueDate) {
      prevTo = s.to!
      winStart = addDays(s.dueDate, 1)
      continue
    }
    const len = Math.max(1, daysBetween(winStart, s.dueDate) + 1)
    const d = Math.max(0, daysBetween(winStart, today))
    return Math.round(prevTo + ((s.to! - prevTo) * d) / len)
  }
  return prevTo
}

/** 일정 대비 앞섬/뒤처짐. 전체의 5%(최소 1)까지는 일정대로 */
export function pace(pos: number, expected: number | null, total: number | null): Pace | null {
  if (expected == null) return null
  const tol = Math.max(1, Math.round((total ?? 0) * 0.05))
  return pos > expected + tol ? 'ahead' : pos < expected - tol ? 'behind' : 'onTrack'
}

interface ShelfPos { status?: string, position?: { page?: number | null, percent?: number | null, minutes?: number | null } }
/** 책장 기록에서 모임 단위의 현재 위치. 다 읽었으면 끝까지 */
export function readerPosition(s: ShelfPos | null | undefined, unit: ReadingGroupInput['unit'], total: number | null): number {
  if (!s) return 0
  const v = (unit === 'page' ? s.position?.page : unit === 'percent' ? s.position?.percent : s.position?.minutes) ?? 0
  return s.status === 'done' ? Math.max(v, total ?? 0) : v
}

/** READ-43 스포일러 가리기: 그 일정 범위를 다 읽기 전에는 이야기를 가린다 */
export const isSpoiler = (item: Pick<ScheduleItem, 'to'>, myPos: number, done: boolean) => !done && item.to != null && myPos < item.to
