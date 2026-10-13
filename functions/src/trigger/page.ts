import { getFirestore } from 'firebase-admin/firestore'
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { notifyMembers } from '../lib/notify'
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

/** CMN-23: 작성자가 피드백을 요청한 사람(`reviewerIds`에 새로 들어온 사람)에게 알림. 요청받은 사람은 그 글을 볼 수 있다(NOTE-53) */
export const onPageReviewersChanged = onDocumentUpdated('spaces/{sid}/pages/{pageId}', async (event) => {
  const before = (event.data?.before.get('reviewerIds') ?? []) as string[]
  const p = event.data?.after.data()
  if (!p || p.deletedAt) return
  const added = ((p.reviewerIds ?? []) as string[]).filter(uid => !before.includes(uid))
  if (!added.length) return
  const { sid, pageId } = event.params
  const owner = (await getFirestore().doc(`users/${p.ownerId}`).get()).get('displayName') ?? ''
  await notifyMembers(sid, added.map(uid => ({
    uid,
    type: 'feedbackRequest' as const,
    actorId: p.ownerId,
    refPath: `/s/${sid}/notes/${pageId}`,
    title: `${owner}님이 '${p.title || '제목 없음'}'에 피드백을 요청했어요`,
    body: '',
  })))
})

/** REV-10: 독후감을 발행하면(나만 보기 → 공간 전체, publishedAt) 피드에 큰 활동으로 */
export const onReviewPublished = onDocumentUpdated('spaces/{sid}/pages/{pageId}', async (event) => {
  const before = event.data?.before.data()
  const p = event.data?.after.data()
  if (!before || !p || p.type !== 'bookReview' || p.deletedAt || typeof p.ownerId !== 'string') return
  if (p.visibility !== 'space' || before.visibility === 'space' || !p.publishedAt) return
  await addActivity(event.params.sid, {
    uid: p.ownerId,
    module: 'notes',
    type: 'bookReview',
    size: 'major',
    refType: 'page',
    refId: event.params.pageId,
    data: { title: p.book?.title ?? p.title ?? '' },
    visibility: 'space',
  })
})
