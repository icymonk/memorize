import type { ReadingGroupInput } from '#shared/reading-groups'
import type { Firestore, Timestamp } from 'firebase/firestore'
import { addDoc, arrayRemove, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, updateDoc } from 'firebase/firestore'
import { addToShelf } from './shelf'

export interface ReadingGroup extends ReadingGroupInput {
  id: string
  createdBy: string
  hostIds: string[]
  participantIds: string[]
  closedAt: Timestamp | null
  createdAt?: Timestamp
}

const groupsOf = (db: Firestore, sid: string) => collection(db, 'spaces', sid, 'readingGroups')

export async function listReadingGroups(db: Firestore, sid: string): Promise<ReadingGroup[]> {
  const snap = await getDocs(groupsOf(db, sid))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as ReadingGroup).sort((a, b) => b.startAt.localeCompare(a.startAt))
}

export async function getReadingGroup(db: Firestore, sid: string, id: string): Promise<ReadingGroup | null> {
  const snap = await getDoc(doc(groupsOf(db, sid), id))
  return snap.exists() ? { id: snap.id, ...snap.data() } as ReadingGroup : null
}

/** READ-40: 개설자가 진행자이자 첫 참여자 */
export async function createReadingGroup(db: Firestore, sid: string, uid: string, input: ReadingGroupInput) {
  const now = serverTimestamp()
  const ref = await addDoc(groupsOf(db, sid), { ...input, createdBy: uid, hostIds: [uid], participantIds: [uid], closedAt: null, createdAt: now, updatedAt: now })
  return ref.id
}

export type ReadingGroupPatch = Partial<Pick<ReadingGroupInput, 'startAt' | 'endAt' | 'joinable' | 'schedule' | 'assignees'>>
export const updateReadingGroup = (db: Firestore, sid: string, id: string, patch: ReadingGroupPatch) =>
  updateDoc(doc(groupsOf(db, sid), id), { ...patch, updatedAt: serverTimestamp() })

export const deleteReadingGroup = (db: Firestore, sid: string, id: string) => deleteDoc(doc(groupsOf(db, sid), id))

/** READ-41: 참여하면 그 책을 내 책장에 담는다 (이미 있으면 그대로) */
export async function joinReadingGroup(db: Firestore, sid: string, uid: string, g: ReadingGroup, onShelf: boolean, today: string) {
  await updateDoc(doc(groupsOf(db, sid), g.id), { participantIds: arrayUnion(uid) })
  if (onShelf) return
  await addToShelf(db, sid, uid, {
    title: g.book.title,
    authors: g.book.authors,
    publisher: '',
    cover: g.book.cover,
    isbn13: g.bookKey.startsWith('isbn:') ? g.bookKey.slice(5) : '',
    format: g.unit === 'minute' ? 'audio' : g.unit === 'percent' ? 'ebook' : 'paper',
    total: { pages: null, minutes: null },
    status: g.startAt <= today ? 'reading' : 'want',
  })
}

export const leaveReadingGroup = (db: Firestore, sid: string, uid: string, id: string) =>
  updateDoc(doc(groupsOf(db, sid), id), { participantIds: arrayRemove(uid) })
