import type { StudyMode } from './study'

/** NOTE-32·34: 하루 학습 기록(studySessions) 요약 */
export interface SessionLike { mode: StudyMode, cards: number, correct: number, durationSec: number, deckId?: string }
export interface DaySummary { sessions: number, minutes: number, cards: number, accuracy: number | null, byMode: Partial<Record<StudyMode, number>>, deckIds: string[] }

export function summarizeSessions(list: SessionLike[]): DaySummary {
  const byMode: Partial<Record<StudyMode, number>> = {}
  let sec = 0
  let cards = 0
  let correct = 0
  const decks = new Set<string>()
  for (const s of list) {
    sec += Math.max(0, s.durationSec || 0)
    cards += s.cards
    correct += s.correct
    byMode[s.mode] = (byMode[s.mode] ?? 0) + s.cards
    if (s.deckId) decks.add(s.deckId)
  }
  return { sessions: list.length, minutes: Math.round(sec / 60), cards, accuracy: cards ? Math.round((correct / cards) * 100) : null, byMode, deckIds: [...decks] }
}

const shift = (ymd: string, n: number) => {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number]
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return t.toISOString().slice(0, 10)
}

/** NOTE-37: 오늘(아직 안 썼으면 어제)까지 하루도 빠짐없이 일지를 쓴 날 수 */
export function journalStreak(dates: Iterable<string>, today: string): number {
  const set = new Set(dates)
  let day = set.has(today) ? today : shift(today, -1)
  let n = 0
  while (set.has(day)) {
    n++
    day = shift(day, -1)
  }
  return n
}
