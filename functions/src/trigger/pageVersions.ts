import { onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { VERSION_INTERVAL_MS } from '../../../shared/schemas/page'
import { latestVersion, snapshotPage } from '../lib/pageVersions'

/** NOTE-63: 편집 잠금이 풀리거나 다른 사람에게 넘어갈 때, 그리고 잠금 갱신(30초) 중 마지막 버전이 10분 지났고 바뀐 블록이 있으면 버전을 남긴다 */
export const onPageLockChanged = onDocumentUpdated('spaces/{sid}/pages/{pageId}', async (event) => {
  const before = event.data?.before.get('lock')
  const after = event.data?.after.get('lock')
  if (!before?.uid || event.data?.after.get('deletedAt')) return
  const page = event.data!.after.ref
  if (!after || after.uid !== before.uid) {
    await snapshotPage(event.params.sid, page, before.uid, 'edit')
    return
  }
  const last = await latestVersion(page)
  const at = last.docs[0]?.get('createdAt')?.toDate() as Date | undefined
  if (at) {
    if (Date.now() - at.getTime() < VERSION_INTERVAL_MS) return
    const changed = await page.collection('blocks').where('updatedAt', '>', at).limit(1).get()
    if (changed.empty) return
  }
  await snapshotPage(event.params.sid, page, before.uid, 'edit')
})
