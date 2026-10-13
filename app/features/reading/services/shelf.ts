import type { ShelfInput, ShelfStatus } from '#shared/schemas/book'
import type { Firestore, Timestamp } from 'firebase/firestore'
import { bookKey, shelfId } from '#shared/schemas/book'

export { statusPatch } from '#shared/schemas/book'
import { collection, deleteDoc, doc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore'

export interface ShelfItem extends Omit<ShelfInput, 'isbn13'> {
  id: string
  uid: string
  bookKey: string
  rating?: number | null
  position?: { page?: number | null, percent?: number | null, minutes?: number | null }
  startedAt?: string | null
  finishedAt?: string | null
  updatedAt?: Timestamp
}

export interface BookGroup {
  id: string
  bookKey: string
  title: string
  authors: string[]
  cover: string
  readerUids: string[]
  readingCount: number
  doneCount: number
  avgRating: number | null
}

export async function listMyShelf(db: Firestore, sid: string, uid: string): Promise<ShelfItem[]> {
  const snap = await getDocs(query(collection(db, 'spaces', sid, 'shelf'), where('uid', '==', uid)))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as ShelfItem)
}

export async function listBooks(db: Firestore, sid: string): Promise<BookGroup[]> {
  const snap = await getDocs(collection(db, 'spaces', sid, 'books'))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as BookGroup)
}

/** READ-01·02: 내 책장에 담기. 같은 책을 다시 담으면 덮어쓴다 */
export async function addToShelf(db: Firestore, sid: string, uid: string, input: ShelfInput) {
  const { isbn13, ...rest } = input
  const key = bookKey({ isbn13, title: input.title, authors: input.authors })
  await setDoc(doc(db, 'spaces', sid, 'shelf', shelfId(uid, key)), { ...rest, uid, bookKey: key, rating: null, updatedAt: serverTimestamp() })
  return key
}

export type ShelfPatch = Partial<Pick<ShelfItem, 'status' | 'rating' | 'position' | 'startedAt' | 'finishedAt'>>

/** READ-11: 위치·시작일·완독일·별점 */
export const updateShelf = (db: Firestore, sid: string, id: string, patch: ShelfPatch) =>
  updateDoc(doc(db, 'spaces', sid, 'shelf', id), { ...patch, updatedAt: serverTimestamp() })

/** READ-14: 워크스페이스 책장에서 "나도 읽기" */
export const joinBook = (db: Firestore, sid: string, uid: string, g: BookGroup) => addToShelf(db, sid, uid, {
  title: g.title,
  authors: g.authors,
  publisher: '',
  cover: g.cover,
  isbn13: g.bookKey.startsWith('isbn:') ? g.bookKey.slice(5) : '',
  format: 'paper',
  total: { pages: null, minutes: null },
  status: 'want',
})

export const removeFromShelf = (db: Firestore, sid: string, id: string) => deleteDoc(doc(db, 'spaces', sid, 'shelf', id))
