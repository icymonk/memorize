import type { Firestore } from 'firebase/firestore'
import { collection, deleteDoc, doc, onSnapshot, query, setDoc, where } from 'firebase/firestore'

/** CMN-21 반응 — 한 사람당 대상마다 하나: `spaces/{sid}/reactions/page_{pageId}_{uid}` */
export const REACTIONS = ['👍', '❤️', '🎉', '👏', '😮', '🤔'] as const

export interface Reaction { uid: string, emoji: string }

export function watchPageReactions(db: Firestore, sid: string, pageId: string, cb: (list: Reaction[]) => void, onError: (e: unknown) => void) {
  const q = query(collection(db, 'spaces', sid, 'reactions'), where('targetType', '==', 'page'), where('targetId', '==', pageId))
  return onSnapshot(q, snap => cb(snap.docs.map(d => d.data() as Reaction)), onError)
}

/** 같은 이모지를 다시 누르면 취소, 다른 이모지면 바꾼다 */
export async function toggleReaction(db: Firestore, sid: string, uid: string, pageId: string, emoji: string, current: string | undefined) {
  const ref = doc(db, 'spaces', sid, 'reactions', `page_${pageId}_${uid}`)
  if (current === emoji) await deleteDoc(ref)
  else await setDoc(ref, { targetType: 'page', targetId: pageId, uid, emoji })
}
