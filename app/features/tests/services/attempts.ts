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

export interface HostedResult extends AttemptResult { submittedAtMs: number }

/** 진행자: 시험의 모든 결과 (rules가 hostIds를 보므로 같은 조건으로 조회) */
export async function listResults(db: Firestore, sid: string, tid: string, uid: string): Promise<HostedResult[]> {
  const s = await getDocs(query(collection(db, 'spaces', sid, 'tests', tid, 'results'), where('hostIds', 'array-contains', uid)))
  return s.docs.map(d => ({ id: d.id, ...d.data(), submittedAtMs: d.get('submittedAt')?.toMillis?.() ?? 0 }) as HostedResult)
    .sort((a, b) => b.submittedAtMs - a.submittedAtMs)
}

export async function getAttempt(db: Firestore, sid: string, tid: string, aid: string): Promise<Attempt | null> {
  const s = await getDoc(doc(attemptsOf(db, sid, tid), aid))
  return s.exists() ? ({ id: s.id, ...s.data() }) as Attempt : null
}

export interface KeyItem { answer: (number | boolean | string)[], explanation: string, rubric: string }
/** 진행자만 읽을 수 있다. 아니면 null */
export async function getAnswerKey(db: Firestore, sid: string, tid: string): Promise<Record<string, KeyItem> | null> {
  try {
    const s = await getDoc(doc(db, 'spaces', sid, 'tests', tid, 'secret', 'key'))
    return s.exists() ? (s.get('items') as Record<string, KeyItem>) : null
  }
  catch {
    return null
  }
}

/** CMN-06: 내가 진행하는 시험별 채점 대기 수 */
export async function listGradingQueue(db: Firestore, sid: string, uid: string): Promise<{ id: string, title: string, pending: number }[]> {
  const { listTests } = await import('./tests')
  const { hosting } = await listTests(db, sid, uid)
  const open = hosting.filter(t => t.status !== 'draft')
  const counts = await Promise.all(open.map(t => listResults(db, sid, t.id, uid).then(rs => rs.filter(r => r.gradingStatus === 'pending').length).catch(() => 0)))
  return open.map((t, i) => ({ id: t.id, title: t.title, pending: counts[i]! })).filter(x => x.pending > 0)
}
