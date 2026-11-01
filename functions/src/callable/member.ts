import type { DocumentReference, DocumentSnapshot, Transaction } from 'firebase-admin/firestore'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { can } from '../../../shared/permissions'
import { cancelSpaceDeletionInput, memberTargetInput, respondOwnershipInput, setManagerInput, transferOwnershipInput } from '../../../shared/schemas/space'
import { authedCallable } from '../lib/callable'

interface Loaded {
  spaceRef: DocumentReference
  space: DocumentSnapshot
  me: DocumentSnapshot
  target?: DocumentSnapshot
}

/** 공간·내 멤버 문서(·대상 멤버 문서)를 읽고 워크스페이스·활성 멤버인지 확인한다 */
async function load(tx: Transaction, spaceId: string, uid: string, targetUid?: string): Promise<Loaded> {
  const spaceRef = getFirestore().doc(`spaces/${spaceId}`)
  const members = spaceRef.collection('members')
  const [space, me, target] = await Promise.all([
    tx.get(spaceRef),
    tx.get(members.doc(uid)),
    targetUid ? tx.get(members.doc(targetUid)) : Promise.resolve(undefined),
  ])
  if (!space.exists || space.get('kind') !== 'workspace') throw new HttpsError('not-found', 'space not found')
  if (me.get('status') !== 'active') throw new HttpsError('permission-denied', 'not a member')
  if (target && target.get('status') !== 'active') throw new HttpsError('failed-precondition', 'target not active')
  return { spaceRef, space, me, target }
}

const ctxOf = (space: DocumentSnapshot, me: DocumentSnapshot) =>
  ({ kind: space.get('kind'), settings: space.get('settings'), member: { access: me.get('access'), status: me.get('status') } })

/** 멤버를 내보내거나 나갈 때: 공유 콘텐츠는 남고, 노트 등은 본인만 보기 (WS-23·24, 노트는 onMemberWritten이 ownerStatus로 숨긴다) */
function deactivate(tx: Transaction, space: DocumentSnapshot, uid: string, status: 'left' | 'removed') {
  const spaceRef = space.ref
  const now = FieldValue.serverTimestamp()
  tx.update(spaceRef.collection('members').doc(uid), { status, access: 'member', leftAt: now, updatedAt: now })
  tx.update(spaceRef, { memberCount: FieldValue.increment(-1), updatedAt: now })
  // ACC-32: 이전 워크스페이스 기록 목록. 다시 들어오면 joinSpace가 지운다
  tx.update(getFirestore().doc(`users/${uid}`), { spaceIds: FieldValue.arrayRemove(spaceRef.id), [`formerSpaces.${spaceRef.id}`]: { name: space.get('name') ?? '', leftAt: now }, updatedAt: now })
}

/** WS-22: 매니저 지정/해제 (소유자·매니저). 소유자는 바꿀 수 없다 */
export const setManager = authedCallable(setManagerInput, async ({ uid, data }) => {
  await getFirestore().runTransaction(async (tx) => {
    const { spaceRef, space, me, target } = await load(tx, data.spaceId, uid, data.uid)
    if (!can(ctxOf(space, me), 'manage')) throw new HttpsError('permission-denied', 'managers only')
    if (target!.get('access') === 'owner') throw new HttpsError('failed-precondition', 'cannot change owner')
    tx.update(spaceRef.collection('members').doc(data.uid), { access: data.manager ? 'manager' : 'member', updatedAt: FieldValue.serverTimestamp() })
  })
  return { ok: true as const }
})

/** WS-23: 내보내기 (소유자·매니저). 소유자와 자기 자신은 안 된다. 매니저는 소유자만 내보낼 수 있다 */
export const removeMember = authedCallable(memberTargetInput, async ({ uid, data }) => {
  if (data.uid === uid) throw new HttpsError('failed-precondition', 'use leaveSpace')
  await getFirestore().runTransaction(async (tx) => {
    const { spaceRef, space, me, target } = await load(tx, data.spaceId, uid, data.uid)
    if (!can(ctxOf(space, me), 'manage')) throw new HttpsError('permission-denied', 'managers only')
    const targetAccess = target!.get('access')
    if (targetAccess === 'owner') throw new HttpsError('failed-precondition', 'cannot remove owner')
    if (targetAccess === 'manager' && me.get('access') !== 'owner') throw new HttpsError('permission-denied', 'owner only')
    deactivate(tx, space, data.uid, 'removed')
    if (space.get('ownershipTransfer.to') === data.uid) tx.update(spaceRef, { ownershipTransfer: null })
  })
  return { ok: true as const }
})

/** WS-24: 나가기. 소유자는 소유권을 넘긴 뒤에만 */
export const leaveSpace = authedCallable(cancelSpaceDeletionInput, async ({ uid, data }) => {
  await getFirestore().runTransaction(async (tx) => {
    const { spaceRef, space, me } = await load(tx, data.spaceId, uid)
    if (me.get('access') === 'owner') throw new HttpsError('failed-precondition', 'owner-must-transfer')
    deactivate(tx, space, uid, 'left')
    if (space.get('ownershipTransfer.to') === uid) tx.update(spaceRef, { ownershipTransfer: null })
  })
  return { ok: true as const }
})

/** WS-25: 소유권 넘기기 요청 (uid가 null이면 요청 취소). 상대가 수락해야 완료 */
export const transferOwnership = authedCallable(transferOwnershipInput, async ({ uid, data }) => {
  if (data.uid === uid) throw new HttpsError('failed-precondition', 'already owner')
  await getFirestore().runTransaction(async (tx) => {
    const { spaceRef, space, me } = await load(tx, data.spaceId, uid, data.uid ?? undefined)
    if (!can(ctxOf(space, me), 'delete')) throw new HttpsError('permission-denied', 'owner only')
    tx.update(spaceRef, {
      ownershipTransfer: data.uid ? { from: uid, to: data.uid, at: FieldValue.serverTimestamp() } : null,
      updatedAt: FieldValue.serverTimestamp(),
    })
  })
  return { ok: true as const }
})

/** WS-25: 받는 사람이 수락/거절. 수락하면 이전 소유자는 매니저가 된다 */
export const respondOwnership = authedCallable(respondOwnershipInput, async ({ uid, data }) => {
  await getFirestore().runTransaction(async (tx) => {
    const { spaceRef, space } = await load(tx, data.spaceId, uid)
    const transfer = space.get('ownershipTransfer') as { from: string, to: string } | null | undefined
    if (!transfer || transfer.to !== uid) throw new HttpsError('failed-precondition', 'no pending transfer')
    const now = FieldValue.serverTimestamp()
    if (data.accept) {
      const members = spaceRef.collection('members')
      const from = await tx.get(members.doc(transfer.from))
      if (from.get('access') !== 'owner' || space.get('ownerId') !== transfer.from) throw new HttpsError('failed-precondition', 'stale transfer')
      tx.update(members.doc(uid), { access: 'owner', updatedAt: now })
      tx.update(members.doc(transfer.from), { access: 'manager', updatedAt: now })
      tx.update(spaceRef, { ownerId: uid, ownershipTransfer: null, updatedAt: now })
    }
    else {
      tx.update(spaceRef, { ownershipTransfer: null, updatedAt: now })
    }
  })
  return { ok: true as const }
})
