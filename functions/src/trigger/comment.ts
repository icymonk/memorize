import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'

/** CMN-20: 페이지 댓글 수(`commentCount`)는 서버가 센다 */
export const onCommentWritten = onDocumentWritten('spaces/{sid}/comments/{id}', async (event) => {
  const before = event.data?.before
  const after = event.data?.after
  const delta = (after?.exists ? 1 : 0) - (before?.exists ? 1 : 0)
  const c = (after?.exists ? after : before)?.data()
  if (!delta || !c || c.targetType !== 'page') return
  const page = getFirestore().doc(`spaces/${event.params.sid}/pages/${c.targetId}`)
  if (!(await page.get()).exists) return
  await page.update({ commentCount: FieldValue.increment(delta) })
})
