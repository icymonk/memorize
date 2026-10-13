import type { ResultRelease, TestInput, TestStatus } from '#shared/schemas/test'
import type { Firestore, Timestamp } from 'firebase/firestore'
import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'

export interface Test extends TestInput {
  id: string
  status: TestStatus
  createdBy: string
  hostIds: string[]
  participantIds?: string[]
  maxScore?: number
  deletedAt: Timestamp | null
  openedAt?: Timestamp
  createdAt?: Timestamp
  updatedAt?: Timestamp
}
export type { ResultRelease }

const testsOf = (db: Firestore, sid: string) => collection(db, 'spaces', sid, 'tests')
const toTest = (d: { id: string, data: () => unknown }) => ({ id: d.id, ...(d.data() as object) }) as Test

/** 테스트 목록: 내가 연 시험 / 응시할 수 있는 시험 */
export async function listTests(db: Firestore, sid: string, uid: string): Promise<{ hosting: Test[], taking: Test[] }> {
  const [h, t] = await Promise.all([
    getDocs(query(testsOf(db, sid), where('hostIds', 'array-contains', uid))),
    getDocs(query(testsOf(db, sid), where('participantIds', 'array-contains', uid), where('status', 'in', ['open', 'closed']))),
  ])
  const live = (x: Test) => !x.deletedAt
  return { hosting: h.docs.map(toTest).filter(live), taking: t.docs.map(toTest).filter(live) }
}

export async function getTest(db: Firestore, sid: string, id: string): Promise<Test | null> {
  const s = await getDoc(doc(testsOf(db, sid), id))
  return s.exists() ? toTest(s) : null
}

export async function createTest(db: Firestore, sid: string, uid: string, input: TestInput) {
  const now = serverTimestamp()
  const ref = await addDoc(testsOf(db, sid), { ...input, status: 'draft', createdBy: uid, hostIds: [uid], deletedAt: null, createdAt: now, updatedAt: now })
  return ref.id
}

export async function updateTest(db: Firestore, sid: string, id: string, input: TestInput) {
  await updateDoc(doc(testsOf(db, sid), id), { ...input, updatedAt: serverTimestamp() })
}

export async function setTestStatus(db: Firestore, sid: string, id: string, status: 'open' | 'closed') {
  await updateDoc(doc(testsOf(db, sid), id), { status, updatedAt: serverTimestamp() })
}

export async function deleteTest(db: Firestore, sid: string, id: string) {
  await updateDoc(doc(testsOf(db, sid), id), { deletedAt: serverTimestamp(), updatedAt: serverTimestamp() })
}
