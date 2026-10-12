import type { SrsState } from '#shared/srs'
import { NEVER_DUE, newState } from '#shared/srs'
import type { ReviewItem } from '~/features/vocab/components/study/types'
import type { Firestore, QueryDocumentSnapshot } from 'firebase/firestore'
import { listCards } from '~/features/vocab/services/cards'
import { collection, collectionGroup, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, Timestamp, where } from 'firebase/firestore'

/** VOC-40 카드별 내 상태 (`spaces/{sid}/cardStates/{uid}_{cardId}`) */
export interface CardState extends SrsState {
  sid: string
  uid: string
  deckId: string
  cardId: string
  contentRev: number
  starred?: boolean
}

function fromDoc(d: QueryDocumentSnapshot): CardState {
  const data = d.data()
  return { ...data, sid: d.ref.parent.parent!.id, due: (data.due as Timestamp).toMillis() } as CardState
}

export async function listDeckStates(db: Firestore, sid: string, uid: string, deckId: string): Promise<CardState[]> {
  const snap = await getDocs(query(collection(db, 'spaces', sid, 'cardStates'), where('uid', '==', uid), where('deckId', '==', deckId)))
  return snap.docs.map(fromDoc)
}

/** VOC-44 공간 안 오늘의 복습 */
export async function listDueStates(db: Firestore, sid: string, uid: string, until: number, max: number): Promise<CardState[]> {
  const snap = await getDocs(query(collection(db, 'spaces', sid, 'cardStates'), where('uid', '==', uid), where('due', '<=', Timestamp.fromMillis(until)), orderBy('due'), limit(max)))
  return snap.docs.map(fromDoc)
}

/** WS-53 전체 오늘의 복습 (모든 공간) */
export async function listAllDueStates(db: Firestore, uid: string, until: number, max: number): Promise<CardState[]> {
  const snap = await getDocs(query(collectionGroup(db, 'cardStates'), where('uid', '==', uid), where('due', '<=', Timestamp.fromMillis(until)), orderBy('due'), limit(max)))
  return snap.docs.map(fromDoc)
}

export async function saveState(db: Firestore, s: CardState) {
  const { sid, due, ...rest } = s
  await setDoc(doc(db, 'spaces', sid, 'cardStates', `${s.uid}_${s.cardId}`), { ...rest, due: Timestamp.fromMillis(due), lastReviewedAt: serverTimestamp() }, { merge: true })
}

/** 복습할 상태에 카드 내용을 붙인다. 지워졌거나 더 볼 수 없는 단어장의 카드는 빠진다 */
export async function attachCards(db: Firestore, states: CardState[]): Promise<ReviewItem[]> {
  const groups = new Map<string, CardState[]>()
  for (const s of states) groups.set(`${s.sid}/${s.deckId}`, [...(groups.get(`${s.sid}/${s.deckId}`) ?? []), s])
  const items: ReviewItem[] = []
  await Promise.all([...groups].map(async ([key, group]) => {
    const [sid, deckId] = key.split('/') as [string, string]
    try {
      const byId = new Map((await listCards(db, sid, deckId)).map(c => [c.id, c]))
      for (const state of group) {
        const card = byId.get(state.cardId)
        if (card) items.push({ sid, deckId, card, state })
      }
    }
    catch {}
  }))
  return items.sort((a, b) => a.state!.due - b.state!.due)
}

/** VOC-41 진도 (`spaces/{sid}/deckProgress/{uid}_{deckId}`, 서버 집계) */
export interface DeckProgress { uid: string, deckId: string, masteredCount: number, learningCount: number }

function toProgress(data: Record<string, unknown>): DeckProgress {
  return { uid: data.uid as string, deckId: data.deckId as string, masteredCount: (data.masteredCount as number | undefined) ?? 0, learningCount: (data.learningCount as number | undefined) ?? 0 }
}

export async function listMyProgress(db: Firestore, sid: string, uid: string): Promise<Map<string, DeckProgress>> {
  const snap = await getDocs(query(collection(db, 'spaces', sid, 'deckProgress'), where('uid', '==', uid)))
  return new Map(snap.docs.map(d => [d.data().deckId as string, toProgress(d.data())]))
}

/** VOC-45 멤버 진도: 진도 공유 규칙에 막힌 멤버는 빠진다 */
export async function listMemberProgress(db: Firestore, sid: string, deckId: string, uids: string[]): Promise<DeckProgress[]> {
  const rows = await Promise.all(uids.map(u => getDoc(doc(db, 'spaces', sid, 'deckProgress', `${u}_${deckId}`)).catch(() => null)))
  return rows.filter(r => r?.exists()).map(r => toProgress(r!.data()!))
}

/** VOC-42 별표: 아직 학습하지 않은 카드는 복습에 나오지 않는 '새 카드' 상태로 만든다 */
export async function setStarred(db: Firestore, sid: string, uid: string, deckId: string, card: { id: string, contentRev: number }, existing: CardState | undefined, starred: boolean) {
  const base = existing ?? { ...newState(NEVER_DUE), sid, uid, deckId, cardId: card.id, contentRev: card.contentRev }
  const { sid: _sid, due, ...rest } = base
  await setDoc(doc(db, 'spaces', sid, 'cardStates', `${uid}_${card.id}`), { ...rest, due: Timestamp.fromMillis(due), starred }, { merge: true })
}
