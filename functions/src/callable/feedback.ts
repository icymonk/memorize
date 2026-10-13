import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { feedbackId, leaveFeedbackInput, requestRewriteInput } from '../../../shared/schemas/feedback'
import { authedCallable } from '../lib/callable'
import { notifyMembers } from '../lib/notify'

/** CMN-24·25: 작성자가 피드백을 요청한 사람만 스탬프와 총평을 남긴다. 한 사람당 한 글에 하나, 다시 남기면 고친다 */
export const leaveFeedback = authedCallable(leaveFeedbackInput, async ({ uid, data }) => {
  const db = getFirestore()
  const space = db.doc(`spaces/${data.spaceId}`)
  const [member, page] = await Promise.all([space.collection('members').doc(uid).get(), space.collection('pages').doc(data.pageId).get()])
  if (member.get('status') !== 'active' || !page.exists || page.get('deletedAt')) throw new HttpsError('not-found', 'page not found')
  if (page.get('ownerId') === uid || !((page.get('reviewerIds') ?? []) as string[]).includes(uid)) {
    throw new HttpsError('permission-denied', 'feedback not requested')
  }
  const ref = space.collection('comments').doc(feedbackId(data.pageId, uid))
  const now = FieldValue.serverTimestamp()
  await db.runTransaction(async (tx) => {
    const cur = await tx.get(ref)
    if (cur.exists) tx.update(ref, { stamp: data.stamp, body: data.body, editedAt: now })
    else tx.create(ref, { targetType: 'page', targetId: data.pageId, uid, kind: 'feedback', stamp: data.stamp, body: data.body, mentions: [], createdAt: now })
  })
  return { ok: true as const }
})

/** REV-14: 피드백을 요청받은 사람이 "고쳐서 다시 내 주세요" → 독후감은 임시저장(나만 보기)으로, 글쓴이에게 알림 */
export const requestRewrite = authedCallable(requestRewriteInput, async ({ uid, data }) => {
  const db = getFirestore()
  const space = db.doc(`spaces/${data.spaceId}`)
  const [member, page] = await Promise.all([space.collection('members').doc(uid).get(), space.collection('pages').doc(data.pageId).get()])
  if (member.get('status') !== 'active' || !page.exists || page.get('deletedAt')) throw new HttpsError('not-found', 'page not found')
  if (page.get('type') !== 'bookReview') throw new HttpsError('failed-precondition', 'not a book review')
  if (page.get('ownerId') === uid || !((page.get('reviewerIds') ?? []) as string[]).includes(uid)) {
    throw new HttpsError('permission-denied', 'feedback not requested')
  }
  const now = FieldValue.serverTimestamp()
  await page.ref.update({ visibility: 'private', publishedAt: null, rewriteRequestedAt: now, rewriteRequestedBy: uid, updatedAt: now })
  const name = (await db.doc(`users/${uid}`).get()).get('displayName') ?? ''
  await notifyMembers(data.spaceId, [{
    uid: page.get('ownerId'),
    type: 'feedback',
    actorId: uid,
    refPath: `/s/${data.spaceId}/notes/${data.pageId}`,
    title: `${name}님이 '${page.get('title') || '제목 없음'}'을(를) 고쳐서 다시 내 달라고 했어요`,
    body: data.reason,
  }])
  return { ok: true as const }
})
