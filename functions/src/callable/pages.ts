import type { DocumentReference, DocumentSnapshot, Firestore } from 'firebase-admin/firestore'
import type { PageOpOutput } from '../../../shared/schemas/page'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { MAX_PAGE_DEPTH, movePageInput, pageRefInput } from '../../../shared/schemas/page'
import { authedCallable } from '../lib/callable'

const BATCH = 400

async function load(db: Firestore, uid: string, spaceId: string, pageId: string) {
  const space = db.doc(`spaces/${spaceId}`)
  const [member, page] = await Promise.all([space.collection('members').doc(uid).get(), space.collection('pages').doc(pageId).get()])
  if (member.get('status') !== 'active' || !page.exists) throw new HttpsError('not-found', 'page not found')
  const manager = ['owner', 'manager'].includes(member.get('access'))
  const owner = page.get('ownerId') === uid
  const canSee = owner || page.get('visibility') === 'space'
  if (!canSee) throw new HttpsError('not-found', 'page not found')
  return { space, page, manager, owner, canEdit: owner || (page.get('editorIds') ?? []).includes(uid) }
}

async function commitAll(db: Firestore, writes: [DocumentReference, Record<string, unknown>][]) {
  for (let i = 0; i < writes.length; i += BATCH) {
    const batch = db.batch()
    for (const [ref, data] of writes.slice(i, i + BATCH)) batch.update(ref, data)
    await batch.commit()
  }
}

const descendants = (space: DocumentReference, pageId: string) =>
  space.collection('pages').where('ancestorIds', 'array-contains', pageId).get()

/** 페이지의 조상 목록이 바뀌면 하위 페이지의 조상 목록도 같이 고친다 */
async function reparent(db: Firestore, space: DocumentReference, page: DocumentSnapshot, parentId: string | null, ancestorIds: string[], extra: Record<string, unknown>) {
  const subtree = await descendants(space, page.id)
  const now = FieldValue.serverTimestamp()
  const writes: [DocumentReference, Record<string, unknown>][] = [[page.ref, { parentId, ancestorIds, ...extra, updatedAt: now }]]
  for (const d of subtree.docs) {
    const old = d.get('ancestorIds') as string[]
    writes.push([d.ref, { ancestorIds: [...ancestorIds, page.id, ...old.slice(old.indexOf(page.id) + 1)] }])
  }
  await commitAll(db, writes)
  return writes.length
}

/** NOTE-20: 다른 페이지 안으로 옮기거나 순서를 바꾼다 */
export const movePage = authedCallable(movePageInput, async ({ uid, data }): Promise<PageOpOutput> => {
  const db = getFirestore()
  const { space, page, canEdit } = await load(db, uid, data.spaceId, data.pageId)
  if (!canEdit || page.get('deletedAt')) throw new HttpsError('permission-denied', 'cannot move')
  let ancestorIds: string[] = []
  if (data.parentId) {
    if (data.parentId === page.id) throw new HttpsError('invalid-argument', 'self')
    const parent = await load(db, uid, data.spaceId, data.parentId)
    const pa = (parent.page.get('ancestorIds') ?? []) as string[]
    if (!parent.canEdit || parent.page.get('deletedAt') || pa.includes(page.id))
      throw new HttpsError('permission-denied', 'cannot move here')
    if (parent.page.get('root') !== page.get('root')) throw new HttpsError('invalid-argument', 'different root')
    ancestorIds = [...pa, data.parentId]
  }
  const subtree = await descendants(space, page.id)
  const depth = Math.max(0, ...subtree.docs.map(d => (d.get('ancestorIds') as string[]).length - (page.get('ancestorIds') ?? []).length))
  if (ancestorIds.length + depth >= MAX_PAGE_DEPTH) throw new HttpsError('failed-precondition', 'too deep')
  const count = await reparent(db, space, page, data.parentId, ancestorIds, { order: data.order })
  return { count }
})

/** NOTE-22: 하위 페이지와 함께 휴지통으로. 작성자·매니저 */
export const trashPage = authedCallable(pageRefInput, async ({ uid, data }): Promise<PageOpOutput> => {
  const db = getFirestore()
  const { space, page, owner, manager } = await load(db, uid, data.spaceId, data.pageId)
  if (!owner && !manager) throw new HttpsError('permission-denied', 'cannot trash')
  if (page.get('deletedAt')) return { count: 0 }
  const subtree = await descendants(space, page.id)
  const now = FieldValue.serverTimestamp()
  const mark = { deletedAt: now, deletedBy: uid, trashRootId: page.id }
  const writes: [DocumentReference, Record<string, unknown>][] = [[page.ref, mark]]
  for (const d of subtree.docs) if (!d.get('deletedAt')) writes.push([d.ref, mark])
  await commitAll(db, writes)
  return { count: writes.length }
})

/** NOTE-22: 함께 버린 하위 페이지까지 복원. 원래 부모가 없으면 맨 위로 */
export const restorePage = authedCallable(pageRefInput, async ({ uid, data }): Promise<PageOpOutput> => {
  const db = getFirestore()
  const { space, page, owner, manager } = await load(db, uid, data.spaceId, data.pageId)
  if (!owner && !manager && page.get('deletedBy') !== uid) throw new HttpsError('permission-denied', 'cannot restore')
  if (!page.get('deletedAt')) return { count: 0 }
  const together = await space.collection('pages').where('trashRootId', '==', page.id).get()
  const clear = { deletedAt: null, deletedBy: FieldValue.delete(), trashRootId: FieldValue.delete() }
  await commitAll(db, together.docs.filter(d => d.id !== page.id).map(d => [d.ref, clear]))
  const parentId = page.get('parentId') as string | null
  const parent = parentId ? await space.collection('pages').doc(parentId).get() : null
  if (parentId && (!parent?.exists || parent.get('deletedAt'))) await reparent(db, space, page, null, [], clear)
  else await page.ref.update({ ...clear, updatedAt: FieldValue.serverTimestamp() })
  return { count: Math.max(together.size, 1) }
})
