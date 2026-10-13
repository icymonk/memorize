import type { Firestore, Timestamp } from 'firebase/firestore'
import type { Stamp } from '#shared/schemas/feedback'
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'

/** CMN-20·22 댓글 — docs/dev/data-model.md `spaces/{sid}/comments` */
export interface Comment {
  id: string
  targetType: 'page'
  targetId: string
  uid: string
  kind: 'comment' | 'feedback'
  body: string
  stamp?: Stamp
  mentions: string[]
  createdAt?: Timestamp
  editedAt?: Timestamp
}

const commentsOf = (db: Firestore, sid: string) => collection(db, 'spaces', sid, 'comments')

/** 오래된 순. 정렬은 클라이언트에서 해서 복합 색인이 필요 없다 */
export function watchPageComments(db: Firestore, sid: string, pageId: string, cb: (list: Comment[]) => void, onError: (e: unknown) => void) {
  const q = query(commentsOf(db, sid), where('targetType', '==', 'page'), where('targetId', '==', pageId))
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Comment)
    .sort((a, b) => (a.createdAt?.toMillis() ?? Date.now()) - (b.createdAt?.toMillis() ?? Date.now()))), onError)
}

export async function addComment(db: Firestore, sid: string, uid: string, pageId: string, body: string, mentions: string[]) {
  await addDoc(commentsOf(db, sid), { targetType: 'page', targetId: pageId, uid, kind: 'comment', body, mentions, createdAt: serverTimestamp() })
}

export async function editComment(db: Firestore, sid: string, id: string, body: string, mentions: string[]) {
  await updateDoc(doc(commentsOf(db, sid), id), { body, mentions, editedAt: serverTimestamp() })
}

export async function removeComment(db: Firestore, sid: string, id: string) {
  await deleteDoc(doc(commentsOf(db, sid), id))
}

/** `@이름`을 멤버 uid로. 이름이 겹치면 모두 */
export function findMentions(body: string, members: { uid: string, displayName: string }[]): string[] {
  const ids = new Set<string>()
  for (const m of members) {
    if (m.displayName && body.includes(`@${m.displayName}`)) ids.add(m.uid)
  }
  return [...ids].slice(0, 20)
}
