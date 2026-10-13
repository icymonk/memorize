import type { Firestore, Timestamp } from 'firebase/firestore'
import { collection, getDocs, limit, onSnapshot, orderBy, query, Timestamp as Ts, where } from 'firebase/firestore'

export interface Activity {
  id: string
  uid: string
  module: 'vocab' | 'notes' | 'missions'
  type: 'session' | 'deckCreated' | 'journal' | string
  size: 'major' | 'minor'
  refType: string
  refId: string | null
  data: Record<string, any>
  date: string
  createdAt: Timestamp | null
}

/** CMN-04·10: 모두에게 공개된 활동을 최신순으로 */
export function watchFeed(db: Firestore, sid: string, n: number, cb: (list: Activity[]) => void, onError: (e: unknown) => void) {
  const q = query(collection(db, 'spaces', sid, 'activities'), where('visibility', '==', 'space'), orderBy('createdAt', 'desc'), limit(n))
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Activity)), onError)
}

/** 기기 시간대 기준 YYYY-MM-DD */
export function localYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** CMN-03: 이 공간에서 since 이후 내 학습 기록 (날짜, 분) */
export async function listMySessionsSince(db: Firestore, sid: string, uid: string, since: Date) {
  const snap = await getDocs(query(collection(db, 'spaces', sid, 'studySessions'), where('uid', '==', uid), where('endedAt', '>=', Ts.fromDate(since))))
  return snap.docs.map((d) => {
    const ended = d.get('endedAt') as Timestamp | null
    return { date: ended ? localYmd(ended.toDate()) : '', minutes: Math.round((d.get('durationSec') ?? 0) / 60) }
  }).filter(s => s.date)
}
