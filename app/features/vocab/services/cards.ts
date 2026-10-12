import type { CardInput } from '#shared/schemas/card'
import type { Firestore } from 'firebase/firestore'
import { collection, doc, getDocs, orderBy, query, setDoc, writeBatch } from 'firebase/firestore'

export interface Card extends CardInput { id: string, order: number, contentRev: number }

const cardsOf = (db: Firestore, sid: string, deckId: string) => collection(db, 'spaces', sid, 'decks', deckId, 'cards')
/** 규칙이 같은 문서 읽기를 묶음당 한 번만 세므로 500건 한도 안에서 넉넉히 나눈다 */
const BATCH = 400

/** Firestore는 undefined 값을 거부한다 */
function clean<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>
}

function toDoc({ id: _id, ...card }: Card) {
  return clean(card)
}

export async function listCards(db: Firestore, sid: string, deckId: string): Promise<Card[]> {
  const snap = await getDocs(query(cardsOf(db, sid, deckId), orderBy('order')))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Card)
}

export async function addCards(db: Firestore, sid: string, deckId: string, inputs: CardInput[], startOrder: number) {
  for (let i = 0; i < inputs.length; i += BATCH) {
    const batch = writeBatch(db)
    inputs.slice(i, i + BATCH).forEach((input, j) => {
      batch.set(doc(cardsOf(db, sid, deckId)), { ...clean(input), order: startOrder + i + j, contentRev: 0 })
    })
    await batch.commit()
  }
}

/** 표 편집에서 새로 넣는 카드의 ID */
export const newCardId = (db: Firestore, sid: string, deckId: string) => doc(cardsOf(db, sid, deckId)).id

export async function saveCard(db: Firestore, sid: string, deckId: string, card: Card) {
  await setDoc(doc(cardsOf(db, sid, deckId), card.id), toDoc(card))
}

/** 표 편집(VOC-13): 바뀐 카드와 지운 카드를 묶어서 저장 */
export async function saveCards(db: Firestore, sid: string, deckId: string, changed: Card[], removedIds: string[] = []) {
  const ops = [...changed.map(c => ({ c })), ...removedIds.map(id => ({ id }))]
  for (let i = 0; i < ops.length; i += BATCH) {
    const batch = writeBatch(db)
    for (const op of ops.slice(i, i + BATCH)) {
      if ('c' in op) batch.set(doc(cardsOf(db, sid, deckId), op.c.id), toDoc(op.c))
      else batch.delete(doc(cardsOf(db, sid, deckId), op.id))
    }
    await batch.commit()
  }
}
