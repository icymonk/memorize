import { describe, expect, it } from 'vitest'
import { journalStreak, summarizeSessions } from './journal'

describe('summarizeSessions', () => {
  it('sums time, cards, accuracy and decks', () => {
    const s = summarizeSessions([
      { mode: 'review', cards: 20, correct: 15, durationSec: 300, deckId: 'd1' },
      { mode: 'learn', cards: 10, correct: 9, durationSec: 150, deckId: 'd1' },
      { mode: 'match', cards: 6, correct: 6, durationSec: 30 },
    ])
    expect(s).toEqual({ sessions: 3, minutes: 8, cards: 36, accuracy: 83, byMode: { review: 20, learn: 10, match: 6 }, deckIds: ['d1'] })
  })
  it('handles an empty day', () => {
    expect(summarizeSessions([]).accuracy).toBeNull()
  })
})

describe('journalStreak', () => {
  it('counts back from today, or from yesterday if today is not written yet', () => {
    expect(journalStreak(['2026-10-12', '2026-10-11', '2026-10-10', '2026-10-08'], '2026-10-12')).toBe(3)
    expect(journalStreak(['2026-10-11', '2026-10-10'], '2026-10-12')).toBe(2)
    expect(journalStreak(['2026-10-10'], '2026-10-12')).toBe(0)
  })
  it('crosses month boundaries', () => {
    expect(journalStreak(['2026-11-01', '2026-10-31', '2026-10-30'], '2026-11-01')).toBe(3)
  })
})
