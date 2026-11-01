export interface ModeResult { cards: number, correct: number, ms?: number, missed?: string[] }

export interface ReviewItem { sid: string, deckId: string, card: import('~/features/vocab/services/cards').Card, state: import('~/features/vocab/services/srs').CardState | null }
