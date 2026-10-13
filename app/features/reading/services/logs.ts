import type { ReadingLogInput } from '#shared/schemas/book'
import type { Firestore, Timestamp } from 'firebase/firestore'
import type { ShelfItem, ShelfPatch } from './shelf'
import { positionKey, reachedEnd, statusPatch } from '#shared/schemas/book'
import { collection, doc, getDocs, query, serverTimestamp, where, writeBatch } from 'firebase/firestore'
import { confirmDialog } from '~/composables/useDialogs'
import { updateShelf } from './shelf'

export interface ReadingLog extends ReadingLogInput {
  id: string
  uid: string
  createdAt?: Timestamp
}

/** READ-23: 이 책의 내 기록, 최근 날짜부터 */
export async function listBookLogs(db: Firestore, sid: string, uid: string, bookKey: string): Promise<ReadingLog[]> {
  const snap = await getDocs(query(collection(db, 'spaces', sid, 'readingLogs'), where('uid', '==', uid), where('bookKey', '==', bookKey)))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as ReadingLog)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0))
}

/** READ-20·21: 기록을 남기고 책장의 현재 위치를 옮긴다. 읽고 싶음이던 책은 읽는 중으로 */
export async function recordReading(db: Firestore, sid: string, uid: string, book: ShelfItem, input: ReadingLogInput): Promise<ShelfPatch> {
  const batch = writeBatch(db)
  batch.set(doc(collection(db, 'spaces', sid, 'readingLogs')), { ...input, uid, title: book.title, createdAt: serverTimestamp() })
  const patch: ShelfPatch = {}
  if (input.to != null) patch.position = { ...book.position, [positionKey(input.unit)]: input.to }
  if (book.status === 'want' || book.status === 'dropped') Object.assign(patch, statusPatch(book, 'reading', input.date))
  if (Object.keys(patch).length) batch.update(doc(db, 'spaces', sid, 'shelf', book.id), { ...patch, updatedAt: serverTimestamp() })
  await batch.commit()
  return patch
}

/** READ-24: 끝에 닿으면 "다 읽었나요?" */
export async function askFinish(db: Firestore, sid: string, book: ShelfItem, input: ReadingLogInput, question: string): Promise<ShelfPatch | null> {
  if (book.status === 'done' || !reachedEnd(input.unit, input.to, book.total)) return null
  if (!await confirmDialog(question)) return null
  const patch = statusPatch(book, 'done', input.date)
  await updateShelf(db, sid, book.id, patch)
  return patch
}
