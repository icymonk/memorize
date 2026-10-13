import { normalizeAnswer } from './study'

/** VOC-10 유의어·반의어: 같은 단어장에서 앞면이 같은 카드가 있으면 연결한다 */
export interface Related { text: string, cardId?: string }

export function linkRelated(items: readonly Related[], cards: readonly { id: string, front: string }[], selfId?: string): Related[] {
  const byFront = new Map(cards.filter(c => c.id !== selfId).map(c => [normalizeAnswer(c.front), c.id]))
  return items.map(({ text }) => {
    const cardId = byFront.get(normalizeAnswer(text))
    return cardId ? { text, cardId } : { text }
  })
}
