import type { MatchEntry } from '../../../shared/study'
import { getFirestore } from 'firebase-admin/firestore'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { mergeMatchTop } from '../../../shared/study'

/** 매칭 기록이면 matchTop·내 최고 기록 갱신 (활동 생성은 1-A4) */
export const onStudySessionCreated = onDocumentCreated('spaces/{sid}/studySessions/{id}', async (event) => {
  const s = event.data?.data()
  if (!s || s.mode !== 'match' || typeof s.deckId !== 'string' || !(s.durationSec > 0) || s.correct !== s.cards) return
  const ms = Math.round(s.durationSec * 1000)
  const db = getFirestore()
  const topRef = db.doc(`spaces/${event.params.sid}/decks/${s.deckId}/matchTop/top`)
  const progressRef = db.doc(`spaces/${event.params.sid}/deckProgress/${s.uid}_${s.deckId}`)
  await db.runTransaction(async (tx) => {
    const [top, progress] = await Promise.all([tx.get(topRef), tx.get(progressRef)])
    tx.set(topRef, { entries: mergeMatchTop((top.data()?.entries ?? []) as MatchEntry[], { uid: s.uid, ms, at: Date.now() }) })
    const best = progress.data()?.bestMatchMs as number | undefined
    if (!best || ms < best) tx.set(progressRef, { uid: s.uid, deckId: s.deckId, bestMatchMs: ms }, { merge: true })
  })
})
