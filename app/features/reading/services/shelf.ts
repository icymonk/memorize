import type { ShelfInput, ShelfStatus } from '#shared/schemas/book'
import type { Firestore, Timestamp } from 'firebase/firestore'
import { bookKey, shelfId } from '#shared/schemas/book'
import { collection, deleteDoc, doc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore'

export interface ShelfItem extends Omit<ShelfInput, 'isbn13'> {
  id: string
  uid: string
  bookKey: string
  rating?: number | null
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

export const setShelfStatus = (db: Firestore, sid: string, id: string, status: ShelfStatus) =>
  updateDoc(doc(db, 'spaces', sid, 'shelf', id), { status, updatedAt: serverTimestamp() })

export const removeFromShelf = (db: Firestore, sid: string, id: string) => deleteDoc(doc(db, 'spaces', sid, 'shelf', id))
