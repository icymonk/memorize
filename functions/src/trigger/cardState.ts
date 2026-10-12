import type { CardStatus } from '../../../shared/srs'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { progressDelta } from '../../../shared/srs'

const STUDY_FIELDS = ['reps', 'lapses', 'correct', 'wrong'] as const

/** 진도(deckProgress) 집계, 처음 학습하면 단어장 learnerCount +1 (오답 노트는 3단계) */
export const onCardStateWritten = onDocumentWritten('spaces/{sid}/cardStates/{id}', async (event) => {
  const before = event.data?.before.data()
  const after = event.data?.after.data()
  const d = progressDelta(before?.status as CardStatus | undefined, after?.status as CardStatus | undefined)
  const studied = !!after && STUDY_FIELDS.some(f => before?.[f] !== after[f])
  if (!d.mastered && !d.learning && !studied) return

  const s = (after ?? before)!
  const db = getFirestore()
  const progressRef = db.doc(`spaces/${event.params.sid}/deckProgress/${s.uid}_${s.deckId}`)
  const deckRef = db.doc(`spaces/${event.params.sid}/decks/${s.deckId}`)
  await db.runTransaction(async (tx) => {
    const [progress, deck] = await Promise.all([tx.get(progressRef), tx.get(deckRef)])
    if (!deck.exists) return
    if (studied && progress.data()?.learningCount === undefined)
      tx.update(deckRef, { learnerCount: FieldValue.increment(1) })
    tx.set(progressRef, {
      uid: s.uid,
      deckId: s.deckId,
      masteredCount: FieldValue.increment(d.mastered),
      learningCount: FieldValue.increment(d.learning),
      ...(studied ? { lastStudiedAt: FieldValue.serverTimestamp() } : {}),
    }, { merge: true })
  })
})
