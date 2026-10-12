import type { MatchEntry, StudyMode } from '#shared/study'
import type { Firestore } from 'firebase/firestore'
import { addDoc, collection, doc, getDoc, serverTimestamp } from 'firebase/firestore'

export interface SessionResult { deckId: string, mode: StudyMode, cards: number, correct: number, durationSec: number, startedAt: Date }

/** VOC-32: 한 회가 끝나면 기록 (활동·매칭 순위는 서버 트리거가 처리) */
export async function recordSession(db: Firestore, sid: string, uid: string, r: SessionResult) {
  await addDoc(collection(db, 'spaces', sid, 'studySessions'), { ...r, uid, newlyMastered: 0, endedAt: serverTimestamp() })
}

export async function getMatchTop(db: Firestore, sid: string, deckId: string): Promise<MatchEntry[]> {
  const snap = await getDoc(doc(db, 'spaces', sid, 'decks', deckId, 'matchTop', 'top'))
  return (snap.data()?.entries ?? []) as MatchEntry[]
}

export async function getBestMatchMs(db: Firestore, sid: string, uid: string, deckId: string): Promise<number | null> {
  const snap = await getDoc(doc(db, 'spaces', sid, 'deckProgress', `${uid}_${deckId}`))
  return (snap.data()?.bestMatchMs as number | undefined) ?? null
}
