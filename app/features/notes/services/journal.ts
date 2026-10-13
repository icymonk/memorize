import type { Firestore } from 'firebase/firestore'
import type { SessionLike } from '#shared/journal'
import { collection, collectionGroup, getDocs, query, Timestamp, where } from 'firebase/firestore'

/** NOTE-32: 그 사람이 이 공간에서 그 날(기기 시간대 기준) 남긴 학습 기록 */
export async function listDaySessions(db: Firestore, sid: string, uid: string, ymd: string): Promise<SessionLike[]> {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number]
  const start = new Date(y, m - 1, d)
  const end = new Date(y, m - 1, d + 1)
  const snap = await getDocs(query(collection(db, 'spaces', sid, 'studySessions'),
    where('uid', '==', uid), where('endedAt', '>=', Timestamp.fromDate(start)), where('endedAt', '<', Timestamp.fromDate(end))))
  return snap.docs.map(s => s.data() as SessionLike)
}

/** NOTE-39: 모든 공간에서 내가 쓴 일지 (나만 읽는 collectionGroup 규칙) */
export interface MyJournal { sid: string, id: string, title: string, icon: string, date: string | null, mood: string | null }
export async function listMyJournals(db: Firestore, uid: string): Promise<MyJournal[]> {
  const snap = await getDocs(query(collectionGroup(db, 'pages'), where('ownerId', '==', uid), where('type', '==', 'journal')))
  const str = (v: unknown) => (typeof v === 'string' ? v : null)
  return snap.docs.filter(d => !d.get('deletedAt')).map(d => ({
    sid: d.ref.parent.parent!.id,
    id: d.id,
    title: d.get('title') ?? '',
    icon: d.get('icon') ?? '',
    date: str(d.get('props.date')),
    mood: str(d.get('props.mood')),
  }))
}
