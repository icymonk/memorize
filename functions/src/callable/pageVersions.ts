import type { GetVersionOutput, PageOpOutput } from '../../../shared/schemas/page'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { versionRefInput } from '../../../shared/schemas/page'
import { authedCallable } from '../lib/callable'
import { canEditPage, canSeePage, readBlocks, readVersion, snapshotPage, versionStats } from '../lib/pageVersions'

const BATCH = 400

async function load(uid: string, spaceId: string, pageId: string, versionId: string) {
  const space = getFirestore().doc(`spaces/${spaceId}`)
  const [member, page] = await Promise.all([space.collection('members').doc(uid).get(), space.collection('pages').doc(pageId).get()])
  if (member.get('status') !== 'active' || !page.exists || !canSeePage(page.data()!, uid, member.get('groupIds') ?? [])) {
    throw new HttpsError('not-found', 'page not found')
  }
  const version = await page.ref.collection('versions').doc(versionId).get()
  if (!version.exists) throw new HttpsError('not-found', 'version not found')
  return { page, version }
}

/** NOTE-63: 이전 버전 보기 */
export const getVersion = authedCallable(versionRefInput, async ({ uid, data }): Promise<GetVersionOutput> => {
  const { version } = await load(uid, data.spaceId, data.pageId, data.versionId)
  return { blocks: await readVersion(String(version.get('storagePath'))) }
})

/** NOTE-63: 되돌리기. 지금 상태를 먼저 버전으로 남기고 블록을 그 버전으로 다시 쓴다 */
export const restoreVersion = authedCallable(versionRefInput, async ({ uid, data }): Promise<PageOpOutput> => {
  const { page, version } = await load(uid, data.spaceId, data.pageId, data.versionId)
  if (!canEditPage(page.data()!, uid)) throw new HttpsError('permission-denied', 'cannot edit page')
  const target = await readVersion(String(version.get('storagePath')))
  await snapshotPage(data.spaceId, page.ref, uid, 'restore')
  const current = await readBlocks(page.ref)
  const keep = new Set(target.map(b => b.id))
  const revs = new Map((await page.ref.collection('blocks').get()).docs.map(d => [d.id, Number(d.get('rev')) || 0]))
  const db = getFirestore()
  const now = FieldValue.serverTimestamp()
  const ops: ((b: FirebaseFirestore.WriteBatch) => void)[] = [
    ...current.filter(b => !keep.has(b.id)).map(b => (w: FirebaseFirestore.WriteBatch) => void w.delete(page.ref.collection('blocks').doc(b.id))),
    ...target.map(({ id, ...b }) => (w: FirebaseFirestore.WriteBatch) => void w.set(page.ref.collection('blocks').doc(id), { ...b, rev: (revs.get(id) ?? 0) + 1, updatedBy: uid, updatedAt: now })),
  ]
  for (let i = 0; i < ops.length; i += BATCH) {
    const batch = db.batch()
    ops.slice(i, i + BATCH).forEach(op => op(batch))
    await batch.commit()
  }
  await page.ref.update({ ...versionStats(target), updatedAt: now })
  return { count: target.length }
})
