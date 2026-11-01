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
async function toggleOn(db: Firestore, sid: string, uid: string, targetType: 'page' | 'feed', targetId: string, emoji: string, current: string | undefined) {
  const ref = doc(db, 'spaces', sid, 'reactions', `${targetType}_${targetId}_${uid}`)
  if (current === emoji) await deleteDoc(ref)
  else await setDoc(ref, { targetType, targetId, uid, emoji })
}

export function toggleReaction(db: Firestore, sid: string, uid: string, pageId: string, emoji: string, current: string | undefined) {
  return toggleOn(db, sid, uid, 'page', pageId, emoji, current)
}

/** CMN-12 피드 반응. targetId는 큰 활동의 ID 또는 같은 날 묶음 `d_{uid}_{date}` */
export function toggleFeedReaction(db: Firestore, sid: string, uid: string, targetId: string, emoji: string, current: string | undefined) {
  return toggleOn(db, sid, uid, 'feed', targetId, emoji, current)
}

/** 보이는 피드 줄들의 반응을 대상별로 묶어 구독한다 (in 조건 30개씩) */
export function watchFeedReactions(db: Firestore, sid: string, targetIds: string[], cb: (byTarget: Record<string, Reaction[]>) => void) {
  const parts: { targetId: string, uid: string, emoji: string }[][] = []
  const emit = () => {
    const out: Record<string, Reaction[]> = {}
    for (const r of parts.flat()) (out[r.targetId] ??= []).push({ uid: r.uid, emoji: r.emoji })
    cb(out)
  }
  const stops: (() => void)[] = []
  for (let i = 0; i < targetIds.length; i += 30) {
    const n = parts.push([]) - 1
    const q = query(collection(db, 'spaces', sid, 'reactions'), where('targetType', '==', 'feed'), where('targetId', 'in', targetIds.slice(i, i + 30)))
    stops.push(onSnapshot(q, (snap) => {
      parts[n] = snap.docs.map(d => d.data() as { targetId: string, uid: string, emoji: string })
      emit()
    }, () => {}))
  }
  return () => stops.forEach(s => s())
}
