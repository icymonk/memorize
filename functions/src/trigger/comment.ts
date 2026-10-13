import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'

/** CMN-20: 페이지 댓글 수(`commentCount`)는 서버가 센다. CMN-22·30: 새 댓글이면 멘션된 사람과 페이지 작성자에게 알림 */
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
  await page.ref.update({ commentCount: FieldValue.increment(delta) })
  if (delta < 0) return

  const author = (await db.doc(`users/${c.uid}`).get()).get('displayName') ?? ''
  const title = page.get('title') || '제목 없음'
  const targets = new Map<string, 'mention' | 'comment'>()
  for (const uid of (c.mentions ?? []) as string[]) targets.set(uid, 'mention')
  const owner = page.get('ownerId') as string
  if (!targets.has(owner)) targets.set(owner, 'comment')
  targets.delete(c.uid)

  const batch = db.batch()
  for (const [uid, type] of targets) {
    const member = await db.doc(`spaces/${sid}/members/${uid}`).get()
    if (member.get('status') !== 'active') continue
    const prefs = (await db.doc(`users/${uid}`).get()).get(`notifications.${type}.inApp`)
    if (prefs === false) continue
    batch.create(db.collection(`users/${uid}/notifications`).doc(), {
      spaceId: sid,
      type,
      actorId: c.uid,
      refPath: `/s/${sid}/notes/${c.targetId}`,
      title: type === 'mention' ? `${author}님이 '${title}'에서 나를 불렀어요` : `${author}님이 '${title}'에 댓글을 남겼어요`,
      body: String(c.body).slice(0, 140),
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    })
  }
  await batch.commit()
})
