import type { ReadingLogInput } from '#shared/schemas/book'
import type { DocumentReference, Firestore, Timestamp } from 'firebase/firestore'
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

/** READ-50: 이 공간의 내 기록 전체 */
export async function listMyLogs(db: Firestore, sid: string, uid: string): Promise<ReadingLog[]> {
  const snap = await getDocs(query(collection(db, 'spaces', sid, 'readingLogs'), where('uid', '==', uid)))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as ReadingLog)
}

/** NOTE-32: 그 사람이 그 날 남긴 독서 기록 (진도를 숨겼으면 규칙이 막는다) */
export async function listDayLogs(db: Firestore, sid: string, uid: string, date: string): Promise<ReadingLog[]> {
  const snap = await getDocs(query(collection(db, 'spaces', sid, 'readingLogs'), where('uid', '==', uid), where('date', '==', date)))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as ReadingLog)
}

/** NOTE-32: 그 날 다 읽은 책 제목 */
export async function listDayFinished(db: Firestore, sid: string, uid: string, date: string): Promise<string[]> {
  const snap = await getDocs(query(collection(db, 'spaces', sid, 'shelf'), where('uid', '==', uid), where('finishedAt', '==', date)))
  return snap.docs.filter(d => d.get('status') === 'done').map(d => d.get('title') as string)
}

/** 책장에서 뺄 때: 이 책의 내 기록·구절 */
export async function myBookData(db: Firestore, sid: string, uid: string, bookKey: string) {
  const [logs, quotes] = await Promise.all(['readingLogs', 'quotes'].map(c =>
    getDocs(query(collection(db, 'spaces', sid, c), where('uid', '==', uid), where('bookKey', '==', bookKey)))))
  return [...logs!.docs, ...quotes!.docs].map(d => d.ref)
}

export async function deleteRefs(db: Firestore, refs: DocumentReference[]) {
  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(db)
    for (const r of refs.slice(i, i + 400)) batch.delete(r)
    await batch.commit()
  }
}
