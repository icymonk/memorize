import type { QuoteInput, QuoteVisibility } from '#shared/schemas/book'
import type { Firestore, QueryConstraint, Timestamp } from 'firebase/firestore'
import { addDoc, collection, deleteDoc, doc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'

export interface Quote extends QuoteInput {
  id: string
  uid: string
  title: string
  createdAt?: Timestamp
}

const col = (db: Firestore, sid: string) => collection(db, 'spaces', sid, 'quotes')

/** READ-30 */
export const addQuote = (db: Firestore, sid: string, uid: string, title: string, input: QuoteInput) =>
  addDoc(col(db, sid), { ...input, uid, title, createdAt: serverTimestamp() })

export const deleteQuote = (db: Firestore, sid: string, id: string) => deleteDoc(doc(db, 'spaces', sid, 'quotes', id))

export const setQuoteVisibility = (db: Firestore, sid: string, id: string, visibility: QuoteVisibility) =>
  updateDoc(doc(db, 'spaces', sid, 'quotes', id), { visibility })

/** READ-31: 내 구절 + (워크스페이스면) 멤버에게 공개된 구절 */
export async function listQuotes(db: Firestore, sid: string, uid: string, shared: boolean, bookKey?: string): Promise<Quote[]> {
  const by: QueryConstraint[] = bookKey ? [where('bookKey', '==', bookKey)] : []
  const snaps = await Promise.all([
    getDocs(query(col(db, sid), where('uid', '==', uid), ...by)),
    ...(shared ? [getDocs(query(col(db, sid), where('visibility', '==', 'space'), ...by))] : []),
  ])
  const all = new Map<string, Quote>()
  for (const s of snaps) for (const d of s.docs) all.set(d.id, { id: d.id, ...d.data() } as Quote)
  return [...all.values()].sort((a, b) => (b.createdAt?.toMillis() ?? Date.now()) - (a.createdAt?.toMillis() ?? Date.now()))
}

/** NOTE-32: 그 날 저장한 구절 수 (남의 일지에서는 공개된 것만) */
export async function countDayQuotes(db: Firestore, sid: string, owner: string, viewer: string, date: string) {
  const vis = owner === viewer ? [] : [where('visibility', '==', 'space')]
  return (await getDocs(query(col(db, sid), where('uid', '==', owner), where('date', '==', date), ...vis))).size
}
