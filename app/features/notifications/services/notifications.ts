import type { Firestore, Timestamp } from 'firebase/firestore'
import { collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore'

export interface AppNotification {
  id: string
  spaceId: string
  type: 'mention' | 'comment' | 'feedbackRequest' | 'feedback' | 'mission' | 'missionReview' | 'group' | 'join'
  actorId: string
  refPath: string
  title: string
  body: string
  read: boolean
  createdAt: Timestamp | null
}

/** CMN-30: 최근 알림 50개를 실시간으로 */
export function watchNotifications(db: Firestore, uid: string, cb: (list: AppNotification[]) => void, onError: (e: unknown) => void) {
  const q = query(collection(db, 'users', uid, 'notifications'), orderBy('createdAt', 'desc'), limit(50))
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }) as AppNotification)), onError)
}

export function markRead(db: Firestore, uid: string, id: string) {
  return updateDoc(doc(db, 'users', uid, 'notifications', id), { read: true })
}

export function removeNotification(db: Firestore, uid: string, id: string) {
  return deleteDoc(doc(db, 'users', uid, 'notifications', id))
}
