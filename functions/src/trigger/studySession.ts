import type { MatchEntry } from '../../../shared/study'
import { getFirestore } from 'firebase-admin/firestore'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { mergeMatchTop } from '../../../shared/study'
import { addActivity } from './activity'

/** CMN-10: 학습 기록을 피드 활동(작은 활동)으로. 진도를 숨긴 멤버면 본인만 본다. 매칭 기록이면 matchTop·내 최고 기록 갱신 */
export const onStudySessionCreated = onDocumentCreated('spaces/{sid}/studySessions/{id}', async (event) => {
  const s = event.data?.data()
  if (!s) return
  await Promise.all([sessionActivity(event.params.sid, s), updateMatchTop(event.params.sid, s)])
})

async function sessionActivity(sid: string, s: FirebaseFirestore.DocumentData) {
  if (!(s.cards > 0) || typeof s.uid !== 'string') return
  const db = getFirestore()
  const [member, deck] = await Promise.all([
    db.doc(`spaces/${sid}/members/${s.uid}`).get(),
    typeof s.deckId === 'string' ? db.doc(`spaces/${sid}/decks/${s.deckId}`).get() : null,
  ])
  await addActivity(sid, {
    uid: s.uid,
    module: 'vocab',
    type: 'session',
    size: 'minor',
    refType: 'deck',
    refId: typeof s.deckId === 'string' ? s.deckId : null,
    data: { mode: s.mode, cards: s.cards, correct: s.correct, minutes: Math.round((s.durationSec ?? 0) / 60), title: deck?.get('title') ?? '' },
    visibility: member.get('hideProgress') === true ? 'private' : 'space',
    at: s.endedAt?.toDate?.() ?? new Date(),
  })
}

async function updateMatchTop(sid: string, s: FirebaseFirestore.DocumentData) {
  if (s.mode !== 'match' || typeof s.deckId !== 'string' || !(s.durationSec > 0) || s.correct !== s.cards) return
  const ms = Math.round(s.durationSec * 1000)
  const db = getFirestore()
  const topRef = db.doc(`spaces/${sid}/decks/${s.deckId}/matchTop/top`)
  const progressRef = db.doc(`spaces/${sid}/deckProgress/${s.uid}_${s.deckId}`)
  await db.runTransaction(async (tx) => {
    const [top, progress] = await Promise.all([tx.get(topRef), tx.get(progressRef)])
    tx.set(topRef, { entries: mergeMatchTop((top.data()?.entries ?? []) as MatchEntry[], { uid: s.uid, ms, at: Date.now() }) })
    const best = progress.data()?.bestMatchMs as number | undefined
    if (!best || ms < best) tx.set(progressRef, { uid: s.uid, deckId: s.deckId, bestMatchMs: ms }, { merge: true })
  })
}
