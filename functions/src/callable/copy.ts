import type { DocumentSnapshot } from 'firebase-admin/firestore'
import type { CopyContentOutput } from '../../../shared/schemas/copy'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { can, canSeeContent } from '../../../shared/permissions'
import { copyContentInput } from '../../../shared/schemas/copy'
import { authedCallable } from '../lib/callable'

function memberContext(space: DocumentSnapshot, member: DocumentSnapshot) {
  return {
    kind: space.get('kind'),
    settings: space.get('settings'),
    member: member.exists ? { access: member.get('access'), status: member.get('status') } : null,
  }
}

/** WS-60~64, VOC-04: 볼 수 있는 단어장을 내가 만들 수 있는 다른 공간으로 복사. 학습 기록·공동 편집자·파일은 복사하지 않는다 */
export const copyContent = authedCallable(copyContentInput, async ({ uid, data }): Promise<CopyContentOutput> => {
  if (data.fromSpaceId === data.toSpaceId) throw new HttpsError('invalid-argument', 'same space')
  const db = getFirestore()
  const fromRef = db.doc(`spaces/${data.fromSpaceId}`)
  const toRef = db.doc(`spaces/${data.toSpaceId}`)
  const deckRef = fromRef.collection('decks').doc(data.id)
  const [fromSpace, fromMember, toSpace, toMember, deck] = await Promise.all([
    fromRef.get(),
    fromRef.collection('members').doc(uid).get(),
    toRef.get(),
    toRef.collection('members').doc(uid).get(),
    deckRef.get(),
  ])
  if (!fromSpace.exists || !deck.exists || fromMember.get('status') !== 'active')
    throw new HttpsError('not-found', 'deck not found')
  const source = deck.data()!
  if (!canSeeContent({ visibility: source.visibility, createdBy: source.createdBy, groupIds: source.groupIds ?? [], editPolicy: source.editPolicy, collaboratorIds: source.collaboratorIds ?? [] }, uid, fromMember.get('groupIds') ?? []))
    throw new HttpsError('not-found', 'deck not found')
  if (!toSpace.exists || toSpace.get('deleteScheduledAt') || !can(memberContext(toSpace, toMember), 'create'))
    throw new HttpsError('permission-denied', 'cannot create in target space')

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
})
