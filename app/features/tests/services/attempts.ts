import type { Firestore, Timestamp } from 'firebase/firestore'
import { collection, doc, getDoc, getDocs, onSnapshot, query, updateDoc, where } from 'firebase/firestore'

export interface Attempt {
  id: string
  uid: string
  isPractice: boolean
  startedAt: Timestamp
  deadlineAt: Timestamp | null
  submittedAt: Timestamp | null
  order: string[]
  choiceOrder: Record<string, number[]>
  answers: Record<string, unknown>
  maxScore: number
  gradingStatus: 'done' | 'pending' | null
}
export interface AttemptResult {
  id: string
  uid: string
  isPractice: boolean
  score: number
  maxScore: number
  gradingStatus: 'done' | 'pending'
  items: Record<string, { score: number | null, points: number }>
  comments: Record<string, string>
}

const attemptsOf = (db: Firestore, sid: string, tid: string) => collection(db, 'spaces', sid, 'tests', tid, 'attempts')

export async function myAttempts(db: Firestore, sid: string, tid: string, uid: string): Promise<Attempt[]> {
  const s = await getDocs(query(attemptsOf(db, sid, tid), where('uid', '==', uid)))
  return s.docs.map(d => ({ id: d.id, ...d.data() }) as Attempt).sort((a, b) => b.startedAt.toMillis() - a.startedAt.toMillis())
}

export function watchAttempt(db: Firestore, sid: string, tid: string, aid: string, cb: (a: Attempt | null) => void) {
  return onSnapshot(doc(attemptsOf(db, sid, tid), aid), s => cb(s.exists() ? ({ id: s.id, ...s.data() }) as Attempt : null))
}

/** TST-22 자동 저장: 바뀐 답 전체를 덮어쓴다 */
export async function saveAnswers(db: Firestore, sid: string, tid: string, aid: string, answers: Record<string, unknown>) {
  await updateDoc(doc(attemptsOf(db, sid, tid), aid), { answers })
}

export async function getPaper(db: Firestore, sid: string, tid: string) {
  const s = await getDoc(doc(db, 'spaces', sid, 'tests', tid, 'paper', 'main'))
  return s.exists() ? (s.get('items') as import('#shared/schemas/test').PaperItem[]) : null
}

/** 결과 공개 전이면 읽기가 거절되어 null */
export async function getResult(db: Firestore, sid: string, tid: string, aid: string): Promise<AttemptResult | null> {
  try {
    const s = await getDoc(doc(db, 'spaces', sid, 'tests', tid, 'results', aid))
    return s.exists() ? ({ id: s.id, ...s.data() }) as AttemptResult : null
  }
  catch {
    return null
  }
}
