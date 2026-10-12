/** 간격 반복 (R3: SM-2 단순화판, VOC-26) */
export const RATINGS = ['again', 'hard', 'good', 'easy'] as const
export type Rating = (typeof RATINGS)[number]
export type CardStatus = 'new' | 'learning' | 'review' | 'mastered'

export interface SrsState {
  status: CardStatus
  ease: number
  intervalDays: number
  due: number
  reps: number
  lapses: number
  correct: number
  wrong: number
}

export const DAY_MS = 86_400_000
export const RELEARN_MS = 10 * 60_000
export const MASTERED_DAYS = 21
export const DEFAULT_EASE = 2.5
export const MIN_EASE = 1.3
/** ACC-24 설정이 생기기 전 기본 상한 */
export const DAILY_LIMITS = { newCards: 20, reviewCards: 200 } as const

export function newState(now: number): SrsState {
  return { status: 'new', ease: DEFAULT_EASE, intervalDays: 0, due: now, reps: 0, lapses: 0, correct: 0, wrong: 0 }
}

function nextInterval(s: SrsState, rating: Exclude<Rating, 'again'>): number {
  const good = s.reps === 0 ? 1 : s.reps === 1 ? 3 : Math.max(s.intervalDays + 1, Math.round(s.intervalDays * s.ease))
  if (rating === 'hard') return Math.max(1, Math.round(Math.max(s.intervalDays, 1) * 1.2))
  if (rating === 'easy') return Math.max(good + 1, Math.round(good * 1.3))
  return good
}

export function review(s: SrsState, rating: Rating, now: number): SrsState {
  if (rating === 'again') {
    return {
      ...s,
      status: 'learning',
      ease: Math.max(MIN_EASE, s.ease - 0.2),
      intervalDays: 0,
      due: now + RELEARN_MS,
      reps: 0,
      lapses: s.reps > 0 || s.status === 'review' || s.status === 'mastered' ? s.lapses + 1 : s.lapses,
      wrong: s.wrong + 1,
    }
  }
  const intervalDays = nextInterval(s, rating)
  const ease = rating === 'hard' ? Math.max(MIN_EASE, s.ease - 0.15) : rating === 'easy' ? s.ease + 0.15 : s.ease
  return {
    ...s,
    status: intervalDays >= MASTERED_DAYS ? 'mastered' : 'review',
    ease: Math.round(ease * 100) / 100,
    intervalDays,
    due: now + intervalDays * DAY_MS,
    reps: s.reps + 1,
    correct: s.correct + 1,
  }
}

/** 평가 버튼에 보여 줄 다음 간격 미리보기 */
export function preview(s: SrsState, now: number): Record<Rating, number> {
  return Object.fromEntries(RATINGS.map(r => [r, review(s, r, now).due - now])) as Record<Rating, number>
}

/** 오늘 복습할 카드 = 오늘이 끝나기 전에 돌아오는 카드 */
export function endOfToday(now: number): number {
  const d = new Date(now)
  d.setHours(23, 59, 59, 999)
  return d.getTime()
}

/** VOC-41 진도 집계: 상태가 바뀔 때 외운 카드·학습 중 카드 수 변화 */
export function progressDelta(before?: CardStatus, after?: CardStatus): { mastered: number, learning: number } {
  const learning = (s?: CardStatus) => s === 'learning' || s === 'review' ? 1 : 0
  const mastered = (s?: CardStatus) => s === 'mastered' ? 1 : 0
  return { mastered: mastered(after) - mastered(before), learning: learning(after) - learning(before) }
}

/** 별표만 하고 아직 학습하지 않은 카드는 복습에 나오지 않게 아주 먼 날로 둔다 */
export const NEVER_DUE = Date.UTC(9999, 0, 1)
