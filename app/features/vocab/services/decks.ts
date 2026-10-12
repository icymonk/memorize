import type { DeckInput, DeckVisibility, EditPolicy, Lang } from '#shared/schemas/deck'
import type { Firestore, Timestamp } from 'firebase/firestore'
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, or, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'

export interface Deck extends DeckInput {
  id: string
  createdBy: string
  cardCount: number
  learnerCount: number
  copiedFrom?: { spaceId: string, deckId: string } | null
  createdAt?: Timestamp
  updatedAt?: Timestamp
}
export type { DeckVisibility, EditPolicy, Lang }

export interface DeckFolder { id: string, name: string, order: number, ownerId: string }

const decksOf = (db: Firestore, sid: string) => collection(db, 'spaces', sid, 'decks')

/** 규칙이 허용하는 것만 조회: 공간 전체 공개 + 내가 만든 것 (그룹 공개는 그룹 기능과 함께) */
export async function listDecks(db: Firestore, sid: string, uid: string): Promise<Deck[]> {
  const snap = await getDocs(query(decksOf(db, sid), or(where('visibility', '==', 'space'), where('createdBy', '==', uid))))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Deck)
}

export async function getDeck(db: Firestore, sid: string, deckId: string): Promise<Deck | null> {
  const snap = await getDoc(doc(decksOf(db, sid), deckId))
  return snap.exists() ? { id: snap.id, ...snap.data() } as Deck : null
}

export async function createDeck(db: Firestore, sid: string, uid: string, input: DeckInput): Promise<string> {
  const now = serverTimestamp()
  const ref = await addDoc(decksOf(db, sid), { ...input, createdBy: uid, cardCount: 0, learnerCount: 0, createdAt: now, updatedAt: now })
  return ref.id
}

export async function updateDeck(db: Firestore, sid: string, deckId: string, patch: Partial<DeckInput>) {
  await updateDoc(doc(decksOf(db, sid), deckId), { ...patch, updatedAt: serverTimestamp() })
}

export async function deleteDeck(db: Firestore, sid: string, deckId: string) {
  await deleteDoc(doc(decksOf(db, sid), deckId))
}

export async function listFolders(db: Firestore, sid: string): Promise<DeckFolder[]> {
  const snap = await getDocs(query(collection(db, 'spaces', sid, 'deckFolders'), orderBy('order')))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as DeckFolder)
}

export async function createFolder(db: Firestore, sid: string, uid: string, name: string, order: number) {
  const ref = await addDoc(collection(db, 'spaces', sid, 'deckFolders'), { name, order, ownerId: uid })
  return ref.id
}
