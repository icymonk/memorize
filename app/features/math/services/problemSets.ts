import type { ProblemSetInput } from '#shared/schemas/problem-set'
import type { Firestore, Timestamp } from 'firebase/firestore'
import { arrayRemove, arrayUnion, collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore'

/** MATH-10·13 문제집 */
export interface ProblemSet extends ProblemSetInput {
  id: string
  questionIds: string[]
  createdBy: string
  deletedAt: Timestamp | null
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

const setsOf = (db: Firestore, sid: string) => collection(db, 'spaces', sid, 'problemSets')
const toSet = (d: { id: string, data: () => object }) => ({ id: d.id, ...d.data() }) as ProblemSet

/** 내 문제집 + 공개 문제집 (겹치면 하나로) */
export async function listProblemSets(db: Firestore, sid: string, uid: string): Promise<ProblemSet[]> {
  const [mine, shared] = await Promise.all([
    getDocs(query(setsOf(db, sid), where('createdBy', '==', uid))),
    getDocs(query(setsOf(db, sid), where('visibility', '==', 'space'))),
  ])
  const all = new Map([...mine.docs, ...shared.docs].map(d => [d.id, toSet(d)]))
  return [...all.values()].filter(s => !s.deletedAt)
    .sort((a, b) => (b.updatedAt?.toMillis() ?? Infinity) - (a.updatedAt?.toMillis() ?? Infinity))
}

export async function getProblemSet(db: Firestore, sid: string, id: string): Promise<ProblemSet | null> {
  const snap = await getDoc(doc(setsOf(db, sid), id))
  if (!snap.exists()) return null
  const s = toSet(snap)
  return s.deletedAt ? null : s
}

export async function saveProblemSet(db: Firestore, sid: string, uid: string, v: ProblemSetInput, existing?: ProblemSet | null) {
  const ref = existing ? doc(setsOf(db, sid), existing.id) : doc(setsOf(db, sid))
  const now = serverTimestamp()
  await setDoc(ref, existing
    ? { ...v, questionIds: existing.questionIds, createdBy: existing.createdBy, deletedAt: null, createdAt: existing.createdAt ?? now, updatedAt: now }
    : { ...v, questionIds: [], createdBy: uid, deletedAt: null, createdAt: now, updatedAt: now })
  return ref.id
}

export const addToSet = (db: Firestore, sid: string, id: string, questionIds: string[]) =>
  updateDoc(doc(setsOf(db, sid), id), { questionIds: arrayUnion(...questionIds), updatedAt: serverTimestamp() })

export const removeFromSet = (db: Firestore, sid: string, id: string, questionId: string) =>
  updateDoc(doc(setsOf(db, sid), id), { questionIds: arrayRemove(questionId), updatedAt: serverTimestamp() })

export const deleteProblemSet = (db: Firestore, sid: string, id: string) =>
  updateDoc(doc(setsOf(db, sid), id), { deletedAt: serverTimestamp(), updatedAt: serverTimestamp() })
