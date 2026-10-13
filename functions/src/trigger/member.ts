import { getFirestore } from 'firebase-admin/firestore'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'

/** WS-23·24: 멤버가 나가거나 내보내지면 그 사람의 노트를 본인만 보기(`ownerStatus: 'left'`)로, 다시 들어오면 되돌린다 */
export const onMemberWritten = onDocumentWritten('spaces/{sid}/members/{uid}', async (event) => {
  if (!event.data?.before.exists) return
  const was = event.data.before.get('status') === 'active'
  const now = event.data.after.exists && event.data.after.get('status') === 'active'
  if (was === now) return
  const ownerStatus = now ? 'active' : 'left'
  const db = getFirestore()
  const pages = await db.collection(`spaces/${event.params.sid}/pages`).where('ownerId', '==', event.params.uid).get()
  const writer = db.bulkWriter()
  for (const p of pages.docs) {
    if (p.get('ownerStatus') !== ownerStatus) writer.update(p.ref, { ownerStatus })
  }
  await writer.close()
})
