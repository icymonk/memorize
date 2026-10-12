import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { meaningChanged } from '../../../shared/cards'

const NOT_FOUND = 5

/** 카드 수 집계, 지운 카드의 학습 기록 정리, 뜻이 크게 바뀌면 contentRev +1 (docs/dev/functions.md 트리거 표) */
export const onCardWritten = onDocumentWritten('spaces/{sid}/decks/{deckId}/cards/{cardId}', async (event) => {
  const before = event.data?.before.data()
  const after = event.data?.after.data()
  const delta = (after ? 1 : 0) - (before ? 1 : 0)
  if (before && !after) {
    // vocab.md §7: 카드가 지워지면 그 카드의 내 학습 기록도 지운다
    const states = await getFirestore().collection(`spaces/${event.params.sid}/cardStates`).where('cardId', '==', event.params.cardId).get()
    const writer = getFirestore().bulkWriter()
    states.docs.forEach(d => writer.delete(d.ref))
    await writer.close()
  }
  if (delta) {
    try {
      await getFirestore().doc(`spaces/${event.params.sid}/decks/${event.params.deckId}`).update({ cardCount: FieldValue.increment(delta) })
    }
    catch (error) {
      // 단어장을 지우면서 카드가 함께 지워질 때는 단어장 문서가 이미 없다
      if ((error as { code?: number }).code !== NOT_FOUND) throw error
    }
  }
  if (before && after && before.contentRev === after.contentRev && meaningChanged(before.back, after.back))
    await event.data!.after.ref.update({ contentRev: FieldValue.increment(1) })
})
