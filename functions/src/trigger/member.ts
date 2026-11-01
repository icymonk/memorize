import { getFirestore } from 'firebase-admin/firestore'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'

/** WS-23·24: 멤버가 나가거나 내보내지면 그 사람의 노트를 본인만 보기(`ownerStatus: 'left'`)로, 다시 들어오면 되돌린다 */
export const onMemberWritten = onDocumentWritten('spaces/{sid}/members/{uid}', async (event) => {
  if (!event.data?.before.exists) return
  await syncSessionVisibility(event.params.sid, event.params.uid, event.data.before.get('hideProgress'), event.data.after.exists ? event.data.after.get('hideProgress') : undefined)
  if (!event.data.after.exists) return // 멤버 문서는 워크스페이스 삭제(cronSpaceDeletion) 때만 지워진다
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

/** ACC-22·CMN-10: 진도 숨기기를 바꾸면 그 사람의 학습 활동 공개 범위도 따라 바꾼다 */
async function syncSessionVisibility(sid: string, uid: string, before: unknown, after: unknown) {
  if (after === undefined || (before === true) === (after === true)) return
  const visibility = after === true ? 'private' : 'space'
  const db = getFirestore()
  const list = await db.collection(`spaces/${sid}/activities`).where('uid', '==', uid).where('type', 'in', ['session', 'readingLog']).get()
  const writer = db.bulkWriter()
  for (const a of list.docs) {
    if (a.get('visibility') !== visibility) writer.update(a.ref, { visibility })
  }
  await writer.close()
}
