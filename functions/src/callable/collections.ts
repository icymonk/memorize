import type { DocumentReference } from 'firebase-admin/firestore'
import type { PageOpOutput } from '../../../shared/schemas/page'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { collectionRefInput } from '../../../shared/schemas/collection'
import { authedCallable } from '../lib/callable'

const BATCH = 400

/** NOTE-46: 모음 삭제 — 만든 사람(공유 모음은 매니저도). 안의 페이지는 휴지통으로 보내고, 복원하면 일반 페이지가 된다 */
export const deleteCollection = authedCallable(collectionRefInput, async ({ uid, data }): Promise<PageOpOutput> => {
  const db = getFirestore()
  const space = db.doc(`spaces/${data.spaceId}`)
  const [member, col] = await Promise.all([space.collection('members').doc(uid).get(), space.collection('collections').doc(data.collectionId).get()])
  if (member.get('status') !== 'active' || !col.exists) throw new HttpsError('not-found', 'collection not found')
  const manager = ['owner', 'manager'].includes(member.get('access'))
  const owner = col.get('ownerId') === uid
  if (!owner && !(col.get('scope') === 'shared' && manager)) throw new HttpsError('permission-denied', 'cannot delete collection')
  if (col.get('kind') === 'system') throw new HttpsError('failed-precondition', 'system collection')
  const items = await space.collection('pages').where('collectionId', '==', col.id).get()
  const now = FieldValue.serverTimestamp()
  const writes: [DocumentReference, Record<string, unknown>][] = items.docs
    .filter(d => !d.get('deletedAt'))
    .map(d => [d.ref, { deletedAt: now, deletedBy: uid, trashRootId: d.id }])
  for (let i = 0; i < writes.length; i += BATCH) {
    const batch = db.batch()
    for (const [ref, patch] of writes.slice(i, i + BATCH)) batch.update(ref, patch)
    await batch.commit()
  }
  await col.ref.delete()
  return { count: writes.length }
})
