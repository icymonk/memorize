import { z } from 'zod'

/** ACC-21·NOTE-38 리마인더: 15분 단위 시각. 서버는 15분마다 UTC 칸을 보고 보낸다 */
export const REMINDER_STEP_MIN = 15
const SLOT = /^(?:[01]\d|2[0-3]):(?:00|15|30|45)$/
export const reminderTime = z.string().regex(SLOT)

export const remindersInput = z.object({
  review: reminderTime.nullable(),
  journal: reminderTime.nullable(),
  tz: z.string().min(1).max(64),
})
export type RemindersInput = z.infer<typeof remindersInput>
export interface RemindersDoc extends RemindersInput { reviewUtc: string | null, journalUtc: string | null }

const fmt = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`

/** 그 시간대가 UTC보다 몇 분 앞서는지 */
export function tzOffsetMin(tz: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(now)
  const get = (t: string) => Number(parts.find(p => p.type === t)!.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'))
  return Math.round((asUtc - Math.floor(now.getTime() / 60_000) * 60_000) / 60_000)
}

/** 그 시간대의 HH:mm → 지금 기준 UTC HH:mm */
export function toUtcSlot(local: string, tz: string, now = new Date()) {
  const [h, m] = local.split(':').map(Number) as [number, number]
  return fmt((((h * 60 + m - tzOffsetMin(tz, now)) % 1440) + 1440) % 1440)
}

/** 지금이 속한 15분 칸 (UTC) */
export function currentSlot(now = new Date()) {
  return fmt(now.getUTCHours() * 60 + Math.floor(now.getUTCMinutes() / REMINDER_STEP_MIN) * REMINDER_STEP_MIN)
}

export function remindersDoc(r: RemindersInput, now = new Date()): RemindersDoc {
  return {
    ...r,
    reviewUtc: r.review ? toUtcSlot(r.review, r.tz, now) : null,
    journalUtc: r.journal ? toUtcSlot(r.journal, r.tz, now) : null,
  }
}
