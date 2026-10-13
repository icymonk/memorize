import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { addActivity } from './activity'

/** CMN-10: 모두에게 공개된 새 단어장은 피드에 큰 활동으로 */
export const onDeckCreated = onDocumentCreated('spaces/{sid}/decks/{deckId}', async (event) => {
  const d = event.data?.data()
  if (!d || d.visibility !== 'space' || typeof d.createdBy !== 'string') return
  await addActivity(event.params.sid, {
    uid: d.createdBy,
    module: 'vocab',
    type: 'deckCreated',
    size: 'major',
    refType: 'deck',
    refId: event.params.deckId,
    data: { title: d.title ?? '', copied: !!d.copiedFrom },
    visibility: 'space',
  })
})
