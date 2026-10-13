import type { NotifyType } from '../lib/notify'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { STAMP_LABELS } from '../../../shared/schemas/feedback'
import { notifyMembers } from '../lib/notify'

/**
 * CMN-20: 페이지 댓글 수(`commentCount`)와 피드백 수(`feedbackCount`)는 서버가 센다.
 * CMN-22·30: 새 댓글이면 멘션된 사람과 페이지 작성자에게, 새 피드백(CMN-24)이면 작성자에게 알림
 */
export const onCommentWritten = onDocumentWritten('spaces/{sid}/comments/{id}', async (event) => {
  const before = event.data?.before
  const after = event.data?.after
  const delta = (after?.exists ? 1 : 0) - (before?.exists ? 1 : 0)
  const c = (after?.exists ? after : before)?.data()
  if (!delta || !c || c.targetType !== 'page') return
  const db = getFirestore()
  const { sid } = event.params
  const page = await db.doc(`spaces/${sid}/pages/${c.targetId}`).get()
  if (!page.exists) return
  const feedback = c.kind === 'feedback'
  await page.ref.update({ [feedback ? 'feedbackCount' : 'commentCount']: FieldValue.increment(delta) })
  if (delta < 0) return

  const author = (await db.doc(`users/${c.uid}`).get()).get('displayName') ?? ''
  const title = page.get('title') || '제목 없음'
  const owner = page.get('ownerId') as string
  const targets = new Map<string, NotifyType>()
  if (feedback) {
    targets.set(owner, 'feedback')
  }
  else {
    for (const uid of (c.mentions ?? []) as string[]) targets.set(uid, 'mention')
    if (!targets.has(owner)) targets.set(owner, 'comment')
  }
  const titles: Record<string, string> = {
    mention: `${author}님이 '${title}'에서 나를 불렀어요`,
    comment: `${author}님이 '${title}'에 댓글을 남겼어요`,
    feedback: `${author}님이 '${title}'에 피드백을 남겼어요`,
  }
  const body = feedback
    ? [STAMP_LABELS[c.stamp as keyof typeof STAMP_LABELS], c.body].filter(Boolean).join(' · ')
    : String(c.body)
  await notifyMembers(sid, [...targets].map(([uid, type]) => ({
    uid,
    type,
    actorId: c.uid,
    refPath: `/s/${sid}/notes/${c.targetId}`,
    title: titles[type]!,
    body: body.slice(0, 140),
  })))
})
