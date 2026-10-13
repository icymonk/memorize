import type { Firestore } from 'firebase/firestore'
import type { SessionLike } from '#shared/journal'
import { collection, getDocs, query, Timestamp, where } from 'firebase/firestore'

/** NOTE-32: 그 사람이 이 공간에서 그 날(기기 시간대 기준) 남긴 학습 기록 */
export async function listDaySessions(db: Firestore, sid: string, uid: string, ymd: string): Promise<SessionLike[]> {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number]
  const start = new Date(y, m - 1, d)
  const end = new Date(y, m - 1, d + 1)
  const snap = await getDocs(query(collection(db, 'spaces', sid, 'studySessions'),
    where('uid', '==', uid), where('endedAt', '>=', Timestamp.fromDate(start)), where('endedAt', '<', Timestamp.fromDate(end))))
  return snap.docs.map(s => s.data() as SessionLike)
}
