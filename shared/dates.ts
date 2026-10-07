const dayFormatters = new Map<string, Intl.DateTimeFormat>()

function dayFormatter(timeZone: string) {
  let f = dayFormatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    dayFormatters.set(timeZone, f)
  }
  return f
}

/** 사용자 시간대 기준 날짜 키 `YYYY-MM-DD` (학습일지, 연속 학습일, 일일 요약) */
export function dateKey(date: Date, timeZone: string): string {
  return dayFormatter(timeZone).format(date)
}

/** ISO 주차 키 `YYYY-Www` (반복 미션, 주간 랭킹). 입력은 `YYYY-MM-DD` */
export function weekKey(day: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(y, m - 1, d))
  const weekday = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - weekday)
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}
