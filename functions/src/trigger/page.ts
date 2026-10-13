import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { addActivity } from './activity'

/** CMN-10: 모두에게 공개된 학습일지를 쓰면 피드에 작은 활동으로 */
export const onPageCreated = onDocumentCreated('spaces/{sid}/pages/{pageId}', async (event) => {
  const p = event.data?.data()
  if (!p || p.type !== 'journal' || p.visibility !== 'space' || typeof p.ownerId !== 'string') return
  await addActivity(event.params.sid, {
    uid: p.ownerId,
    module: 'notes',
    type: 'journal',
    size: 'minor',
    refType: 'page',
    refId: event.params.pageId,
    data: { date: typeof p.props?.date === 'string' ? p.props.date : null },
    visibility: 'space',
  })
})
