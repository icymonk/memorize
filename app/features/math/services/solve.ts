import type { Firestore, Timestamp } from 'firebase/firestore'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'

/** MATH-20 내 풀이 기록 (서버가 쓰고 본인만 읽는다) */
export interface ProblemAttempt {
  questionId: string
  tries: number
  done: boolean
  correct: boolean | null
  gaveUp: boolean
  score: number | null
  hintsUsed: number
  isPractice: boolean
}

export async function getMyAttempts(db: Firestore, sid: string, uid: string, questionIds: string[]): Promise<Record<string, ProblemAttempt>> {
  const snaps = await Promise.all(questionIds.map(q => getDoc(doc(db, 'spaces', sid, 'problemAttempts', `${uid}_${q}`)).catch(() => null)))
  return Object.fromEntries(snaps.filter(s => s?.exists()).map(s => [s!.get('questionId') as string, s!.data() as ProblemAttempt]))
}

/** MATH-22 풀이 메모 */
export const PROBLEM_NOTE_MAX = 5000
const noteRef = (db: Firestore, sid: string, uid: string, qid: string) => doc(db, 'spaces', sid, 'problemNotes', `${uid}_${qid}`)

export async function getProblemNote(db: Firestore, sid: string, uid: string, qid: string): Promise<{ text: string, updatedAt?: Timestamp } | null> {
  const s = await getDoc(noteRef(db, sid, uid, qid))
  return s.exists() ? (s.data() as { text: string, updatedAt?: Timestamp }) : null
}

export const saveProblemNote = (db: Firestore, sid: string, uid: string, qid: string, text: string) =>
  setDoc(noteRef(db, sid, uid, qid), { uid, questionId: qid, text: text.slice(0, PROBLEM_NOTE_MAX), updatedAt: serverTimestamp() })
