import type { BulkWriter, DocumentData, DocumentReference, DocumentSnapshot } from 'firebase-admin/firestore'
import type { CopyContentInput, CopyContentOutput } from '../../../shared/schemas/copy'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { keyBetween } from '../../../shared/order'
import { can, canSeeContent } from '../../../shared/permissions'
import { copyContentInput } from '../../../shared/schemas/copy'
import { authedCallable } from '../lib/callable'
import { planSubtree } from '../lib/copyPlan'

function memberContext(space: DocumentSnapshot, member: DocumentSnapshot) {
  return {
    kind: space.get('kind'),
    settings: space.get('settings'),
    member: member.exists ? { access: member.get('access'), status: member.get('status') } : null,
  }
}

const MAX_PAGES = 300

interface Ctx { uid: string, data: CopyContentInput, fromRef: DocumentReference, toRef: DocumentReference, fromSpace: DocumentSnapshot, fromMember: DocumentSnapshot, toSpace: DocumentSnapshot }

/** WS-60~64: 볼 수 있는 콘텐츠를 내가 만들 수 있는 다른 공간으로 복사. 학습 기록·댓글·공동 편집자·파일은 복사하지 않는다 */
export const copyContent = authedCallable(copyContentInput, async ({ uid, data }): Promise<CopyContentOutput> => {
  if (data.fromSpaceId === data.toSpaceId) throw new HttpsError('invalid-argument', 'same space')
  const db = getFirestore()
  const fromRef = db.doc(`spaces/${data.fromSpaceId}`)
  const toRef = db.doc(`spaces/${data.toSpaceId}`)
  const [fromSpace, fromMember, toSpace, toMember] = await Promise.all([
    fromRef.get(),
    fromRef.collection('members').doc(uid).get(),
    toRef.get(),
    toRef.collection('members').doc(uid).get(),
  ])
  if (!fromSpace.exists || fromMember.get('status') !== 'active')
    throw new HttpsError('not-found', 'content not found')
  if (!toSpace.exists || toSpace.get('deleteScheduledAt') || !can(memberContext(toSpace, toMember), 'create'))
    throw new HttpsError('permission-denied', 'cannot create in target space')
  const ctx: Ctx = { uid, data, fromRef, toRef, fromSpace, fromMember, toSpace }
  if (data.kind === 'page') return copyPage(ctx)
  if (data.kind === 'collection') return copyCollection(ctx)
  return copyDeck(ctx)
})

/** VOC-04 */
async function copyDeck({ uid, data, fromRef, toRef, fromSpace, fromMember }: Ctx): Promise<CopyContentOutput> {
  const db = getFirestore()
  const deckRef = fromRef.collection('decks').doc(data.id)
  const deck = await deckRef.get()
  if (!deck.exists) throw new HttpsError('not-found', 'deck not found')
  const source = deck.data()!
  if (!canSeeContent({ visibility: source.visibility, createdBy: source.createdBy, groupIds: source.groupIds ?? [], editPolicy: source.editPolicy, collaboratorIds: source.collaboratorIds ?? [] }, uid, fromMember.get('groupIds') ?? []))
    throw new HttpsError('not-found', 'deck not found')

  const cards = await deckRef.collection('cards').get()
  const now = FieldValue.serverTimestamp()
  const newDeck = toRef.collection('decks').doc()
  await newDeck.set({
    ...source,
    folderId: null,
    visibility: 'space',
    groupIds: [],
    editPolicy: 'author',
    collaboratorIds: [],
    createdBy: uid,
    cardCount: 0,
    learnerCount: 0,
    copiedFrom: { spaceId: data.fromSpaceId, deckId: data.id, spaceName: fromSpace.get('name') ?? '' },
    createdAt: now,
    updatedAt: now,
  })
  const writer = db.bulkWriter()
  for (const c of cards.docs) {
    const { imageFileId: _image, audio, ...card } = c.data()
    writer.set(newDeck.collection('cards').doc(), {
      ...card,
      ...(audio?.tts ? { audio: { tts: true } } : {}),
      contentRev: 0,
    })
  }
  await writer.close()
  return { id: newDeck.id }
}

const canSeePage = (p: DocumentData, uid: string) =>
  !p.deletedAt && (p.ownerId === uid || p.visibility === 'space' || (p.sharedWith ?? []).includes(uid) || (p.editorIds ?? []).includes(uid))

/** 복사본은 가져간 사람이 작성자. 공유·댓글·잠금·휴지통 상태는 처음으로 */
function freshPage(p: DocumentData, uid: string, root: 'private' | 'shared') {
  const { deletedBy: _d, trashRootId: _t, collectionId: _c, copiedFrom: _f, ...rest } = p
  const now = FieldValue.serverTimestamp()
  return {
    ...rest,
    ownerId: uid,
    root,
    visibility: root === 'private' ? 'private' : 'space',
    groupIds: [],
    sharedWith: [],
    editorIds: [],
    reviewerIds: [],
    missionIds: [],
    lock: null,
    ownerStatus: 'active',
    commentCount: 0,
    feedbackCount: 0,
    reactionCounts: {},
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  }
}

async function copyBlocks(writer: BulkWriter, from: DocumentReference, to: DocumentReference) {
  const blocks = await from.collection('blocks').get()
  for (const b of blocks.docs) writer.set(to.collection('blocks').doc(b.id), b.data())
}

/** NOTE-27: 페이지와 하위 페이지를 가져갈 공간의 "내 페이지" 맨 아래로 */
async function copyPage({ uid, data, fromRef, toRef, fromSpace }: Ctx): Promise<CopyContentOutput> {
  const db = getFirestore()
  const pages = fromRef.collection('pages')
  const root = await pages.doc(data.id).get()
  if (!root.exists || !canSeePage(root.data()!, uid)) throw new HttpsError('not-found', 'page not found')
  const below = (await pages.where('ancestorIds', 'array-contains', root.id).get()).docs.filter(d => canSeePage(d.data(), uid))
  if (below.length + 1 > MAX_PAGES) throw new HttpsError('failed-precondition', 'too many pages')
  const plan = planSubtree(root.id, below.map(d => ({ id: d.id, parentId: d.get('parentId') ?? null, ancestorIds: d.get('ancestorIds') ?? [] })), () => toRef.collection('pages').doc().id)

  const top = await toRef.collection('pages').where('parentId', '==', null).where('root', '==', 'private').get()
  const last = top.docs.map(d => d.get('order') as string).filter(Boolean).sort().at(-1) ?? null
  const writer = db.bulkWriter()
  for (const src of [root, ...below]) {
    const p = plan.get(src.id)
    if (!p) continue
    const to = toRef.collection('pages').doc(p.id)
    writer.set(to, {
      ...freshPage(src.data()!, uid, 'private'),
      type: 'page',
      parentId: p.parentId,
      ancestorIds: p.ancestorIds,
      ...(src.id === root.id ? { order: keyBetween(last, null), copiedFrom: { spaceId: data.fromSpaceId, pageId: root.id, spaceName: fromSpace.get('name') ?? '' } } : {}),
    })
    await copyBlocks(writer, src.ref, to)
  }
  await writer.close()
  return { id: plan.get(root.id)!.id }
}

/** NOTE-27: 모음 설정·보기와 안의 페이지. 내 공간으로 가면 내 모음, 워크스페이스로 가면 원래 갈래 */
async function copyCollection({ uid, data, fromRef, toRef, fromSpace, toSpace }: Ctx): Promise<CopyContentOutput> {
  const db = getFirestore()
  const col = await fromRef.collection('collections').doc(data.id).get()
  if (!col.exists || (col.get('scope') !== 'shared' && col.get('ownerId') !== uid)) throw new HttpsError('not-found', 'collection not found')
  const items = (await fromRef.collection('pages').where('collectionId', '==', col.id).get()).docs.filter(d => canSeePage(d.data(), uid))
  if (items.length > MAX_PAGES) throw new HttpsError('failed-precondition', 'too many pages')
  const scope: 'private' | 'shared' = toSpace.get('kind') === 'personal' ? 'private' : col.get('scope')
  const newCol = toRef.collection('collections').doc()
  const ids = new Map(items.map(d => [d.id, toRef.collection('pages').doc().id]))
  const now = FieldValue.serverTimestamp()
  const writer = db.bulkWriter()
  writer.set(newCol, {
    ...col.data(),
    ownerId: uid,
    scope,
    templateIds: ((col.get('templateIds') ?? []) as string[]).flatMap(id => (ids.has(id) ? [ids.get(id)!] : [])),
    copiedFrom: { spaceId: data.fromSpaceId, collectionId: col.id, spaceName: fromSpace.get('name') ?? '' },
    createdAt: now,
    updatedAt: now,
  })
  for (const d of items) {
    const to = toRef.collection('pages').doc(ids.get(d.id)!)
    writer.set(to, { ...freshPage(d.data(), uid, scope), type: 'item', collectionId: newCol.id, parentId: null, ancestorIds: [] })
    await copyBlocks(writer, d.ref, to)
  }
  await writer.close()
  return { id: newCol.id }
}
