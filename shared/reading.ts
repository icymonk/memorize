import type { BookFormat, LogUnit, ShelfStatus } from './schemas/book'

export interface LogLike { bookKey: string, title?: string, date: string, unit: LogUnit, from: number | null, to: number | null, minutes: number }
export interface BookDay { bookKey: string, title: string, unit: LogUnit, from: number | null, to: number | null, minutes: number }
export interface ReadingDay { minutes: number, books: BookDay[] }

/** NOTE-32·READ-20: 하루 독서 기록을 책별 범위·시간으로 묶기 */
export function summarizeReading(logs: LogLike[]): ReadingDay {
  const books = new Map<string, BookDay>()
  let minutes = 0
  for (const l of logs) {
    let b = books.get(l.bookKey)
    if (!b) {
      b = { bookKey: l.bookKey, title: l.title ?? '', unit: l.unit, from: null, to: null, minutes: 0 }
      books.set(l.bookKey, b)
    }
    if (l.from != null) b.from = b.from == null ? l.from : Math.min(b.from, l.from)
    if (l.to != null) b.to = b.to == null ? l.to : Math.max(b.to, l.to)
    b.minutes += Math.max(0, l.minutes || 0)
    minutes += Math.max(0, l.minutes || 0)
  }
  return { minutes, books: [...books.values()] }
}

/** 쪽 단위 기록에서 읽은 쪽수 (시작 위치를 모르거나 뒤로 갔으면 0) */
export const pagesRead = (l: LogLike) => l.unit === 'page' && l.from != null && l.to != null && l.to > l.from ? l.to - l.from : 0

export interface ShelfLike { status: ShelfStatus, format: BookFormat, finishedAt?: string | null }
export interface ReadingStats {
  finishedByMonth: number[]
  finished: number
  pages: number
  minutes: number
  avgMinutes: number
  minutesByDay: Record<string, number>
  formats: Record<BookFormat, number>
}

/** READ-50: 그 해 월별 완독 권수, 누적 쪽수·시간, 독서한 날 평균 시간, 독서 달력, 형식 분포 */
export function readingStats(shelf: ShelfLike[], logs: LogLike[], year: number): ReadingStats {
  const finishedByMonth = Array.from({ length: 12 }, () => 0)
  const formats: Record<BookFormat, number> = { paper: 0, ebook: 0, audio: 0 }
  for (const b of shelf) {
    formats[b.format] = (formats[b.format] ?? 0) + 1
    if (b.status === 'done' && b.finishedAt?.startsWith(`${year}-`)) finishedByMonth[Number(b.finishedAt.slice(5, 7)) - 1]!++
  }
  const minutesByDay: Record<string, number> = {}
  let pages = 0
  let minutes = 0
  for (const l of logs) {
    const m = Math.max(0, l.minutes || 0)
    minutesByDay[l.date] = (minutesByDay[l.date] ?? 0) + m
    pages += pagesRead(l)
    minutes += m
  }
  const timedDays = Object.values(minutesByDay).filter(m => m > 0).length
  return {
    finishedByMonth,
    finished: finishedByMonth.reduce((a, b) => a + b, 0),
    pages,
    minutes,
    avgMinutes: timedDays ? Math.round(minutes / timedDays) : 0,
    minutesByDay,
    formats,
  }
}

/** READ-15 책 추천 묶음: 요즘 많이 읽는 책·멤버 별점이 높은 책(4점 이상)·내가 읽은 책과 같은 저자의 책 */
export interface BookGroupLike { bookKey: string, authors: string[], readerUids: string[], readingCount: number, avgRating: number | null }
export function recommendBooks<T extends BookGroupLike>(books: T[], mine: { bookKey: string, authors: string[] }[], limit = 6) {
  const own = new Set(mine.map(m => m.bookKey))
  const authors = new Set(mine.flatMap(m => m.authors).map(a => a.trim()).filter(Boolean))
  const byReaders = (a: T, b: T) => b.readerUids.length - a.readerUids.length
  return {
    popular: books.filter(b => b.readingCount > 0).sort((a, b) => b.readingCount - a.readingCount || byReaders(a, b)).slice(0, limit),
    topRated: books.filter(b => b.avgRating != null && b.avgRating >= 4).sort((a, b) => b.avgRating! - a.avgRating! || byReaders(a, b)).slice(0, limit),
    similar: books.filter(b => !own.has(b.bookKey) && b.authors.some(a => authors.has(a.trim()))).sort(byReaders).slice(0, limit),
  }
}
