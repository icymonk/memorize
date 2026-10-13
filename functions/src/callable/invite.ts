import type { DocumentSnapshot, Transaction } from 'firebase-admin/firestore'
import type { InvitePreview, JoinSpaceOutput } from '../../../shared/schemas/invite'
import { randomInt } from 'node:crypto'
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { LIMITS } from '../../../shared/limits'
import { can } from '../../../shared/permissions'
import { createInviteInput, decideJoinRequestInput, INVITE_CODE_ALPHABET, INVITE_CODE_LENGTH, inviteCodeInput } from '../../../shared/schemas/invite'
import { authedCallable } from '../lib/callable'

const DAY_MS = 24 * 60 * 60 * 1000

function randomCode() {
  return Array.from({ length: INVITE_CODE_LENGTH }, () => INVITE_CODE_ALPHABET[randomInt(INVITE_CODE_ALPHABET.length)]).join('')
}

/** 코드는 모든 공간에서 유일하다. invites 컬렉션 그룹의 `code` 필드로 찾는다 */
async function findInvite(code: string) {
  const snap = await getFirestore().collectionGroup('invites').where('code', '==', code).limit(1).get()
  return snap.docs[0] ?? null
}

function inviteUsable(invite: DocumentSnapshot) {
  if (invite.get('disabled')) return false
  const expiresAt = invite.get('expiresAt') as Timestamp | null
  if (expiresAt && expiresAt.toMillis() <= Date.now()) return false
  const maxUses = invite.get('maxUses') as number | null
  return !(maxUses != null && invite.get('uses') >= maxUses)
}

function memberContext(space: DocumentSnapshot, member: DocumentSnapshot) {
  return {
    kind: space.get('kind'),
    settings: space.get('settings'),
    member: member.exists ? { access: member.get('access'), status: member.get('status') } : null,
  }
}

/** WS-10·11: 초대 링크·코드 만들기 ("초대 가능자" 설정) */
export const createInvite = authedCallable(createInviteInput, async ({ uid, data }) => {
  const db = getFirestore()
  const spaceRef = db.doc(`spaces/${data.spaceId}`)
  const [space, member] = await Promise.all([spaceRef.get(), spaceRef.collection('members').doc(uid).get()])
  if (!space.exists) throw new HttpsError('not-found', 'space not found')
  if (!can(memberContext(space, member), 'invite')) throw new HttpsError('permission-denied', 'cannot invite')

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode()
    if (await findInvite(code)) continue
    const now = FieldValue.serverTimestamp()
    await spaceRef.collection('invites').doc(code).create({
      code,
      createdBy: uid,
      expiresAt: data.expiresInDays ? Timestamp.fromMillis(Date.now() + data.expiresInDays * DAY_MS) : null,
      maxUses: data.maxUses,
      uses: 0,
      disabled: false,
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
    })
    return { code }
  }
  throw new HttpsError('aborted', 'could not allocate code')
})

/** 초대 화면용 미리보기. 쓸 수 없는 초대는 이름만 보여준다 (workspace.md 7절) */
export const getInvite = authedCallable(inviteCodeInput, async ({ uid, data }): Promise<InvitePreview> => {
  const invite = await findInvite(data.code)
  if (!invite) throw new HttpsError('not-found', 'invite not found')
  const spaceRef = invite.ref.parent.parent!
  const [space, member] = await Promise.all([spaceRef.get(), spaceRef.collection('members').doc(uid).get()])
  if (!space.exists) throw new HttpsError('not-found', 'invite not found')

  const base = { spaceId: null, name: space.get('name'), icon: null, color: null, description: '', memberCount: 0, joinPolicy: space.get('settings.joinPolicy') ?? 'link' }
  const status = member.get('status')
  if (status === 'active') return { ...base, status: 'member', spaceId: spaceRef.id }
  if (status === 'pending') return { ...base, status: 'pending' }
  if (!inviteUsable(invite) || space.get('deleteScheduledAt')) return { ...base, status: 'unavailable' }
  const full = space.get('memberCount') >= (space.get('maxMembers') ?? LIMITS.workspaceMaxMembers)
  return {
    ...base,
    status: full ? 'full' : 'ok',
    icon: space.get('icon'),
    color: space.get('color'),
    description: space.get('description') ?? '',
    memberCount: space.get('memberCount'),
  }
})

/** WS-10·11·13: 초대로 참여. 승인 방식이거나 내보내진 사람이면 대기 상태로 */
export const joinSpace = authedCallable(inviteCodeInput, async ({ uid, data }): Promise<JoinSpaceOutput> => {
  const db = getFirestore()
  const found = await findInvite(data.code)
  if (!found) throw new HttpsError('not-found', 'invite not found')
  const spaceRef = found.ref.parent.parent!
  const memberRef = spaceRef.collection('members').doc(uid)
  const userRef = db.doc(`users/${uid}`)

  return db.runTransaction(async (tx: Transaction) => {
    const [invite, space, member, user] = await Promise.all([tx.get(found.ref), tx.get(spaceRef), tx.get(memberRef), tx.get(userRef)])
    if (!user.exists) throw new HttpsError('failed-precondition', 'account not ready')
    if (!space.exists || space.get('kind') !== 'workspace') throw new HttpsError('not-found', 'invite not found')

    const status = member.get('status')
    if (status === 'active') return { spaceId: spaceRef.id, status: 'active' }
    if (status === 'pending') return { spaceId: spaceRef.id, status: 'pending' }
    if (!inviteUsable(invite) || space.get('deleteScheduledAt')) throw new HttpsError('failed-precondition', 'invite-unavailable')

    const pending = space.get('settings.joinPolicy') === 'approval' || status === 'removed'
    if (!pending && space.get('memberCount') >= (space.get('maxMembers') ?? LIMITS.workspaceMaxMembers)) {
      throw new HttpsError('resource-exhausted', 'space-full')
    }

    const now = FieldValue.serverTimestamp()
    tx.set(memberRef, {
      access: 'member',
      status: pending ? 'pending' : 'active',
      displayName: user.get('displayName') ?? '',
      photoURL: user.get('photoURL') ?? null,
      groupIds: [],
      hideProgress: false,
      inviteCode: invite.id,
      schemaVersion: 1,
      joinedAt: pending ? null : now,
      requestedAt: pending ? now : null,
      leftAt: null,
      createdAt: member.exists ? member.get('createdAt') : now,
      updatedAt: now,
    })
    tx.update(invite.ref, { uses: FieldValue.increment(1), updatedAt: now })
    if (!pending) {
      tx.update(spaceRef, { memberCount: FieldValue.increment(1), updatedAt: now })
      tx.update(userRef, { spaceIds: FieldValue.arrayUnion(spaceRef.id), updatedAt: now })
    }
    return { spaceId: spaceRef.id, status: pending ? 'pending' : 'active' }
  })
})

/** WS-13: 가입 대기 승인/거절 (소유자·매니저) */
export const decideJoinRequest = authedCallable(decideJoinRequestInput, async ({ uid, data }) => {
  const db = getFirestore()
  const spaceRef = db.doc(`spaces/${data.spaceId}`)
  const targetRef = spaceRef.collection('members').doc(data.uid)

  await db.runTransaction(async (tx) => {
    const [space, me, target] = await Promise.all([tx.get(spaceRef), tx.get(spaceRef.collection('members').doc(uid)), tx.get(targetRef)])
    if (!space.exists) throw new HttpsError('not-found', 'space not found')
    if (!can(memberContext(space, me), 'manage')) throw new HttpsError('permission-denied', 'managers only')
    if (target.get('status') !== 'pending') throw new HttpsError('failed-precondition', 'not pending')

    if (!data.approve) {
      tx.delete(targetRef)
      return
    }
    if (space.get('memberCount') >= (space.get('maxMembers') ?? LIMITS.workspaceMaxMembers)) {
      throw new HttpsError('resource-exhausted', 'space-full')
    }
    const now = FieldValue.serverTimestamp()
    tx.update(targetRef, { status: 'active', joinedAt: now, updatedAt: now })
    tx.update(spaceRef, { memberCount: FieldValue.increment(1), updatedAt: now })
    tx.update(db.doc(`users/${data.uid}`), { spaceIds: FieldValue.arrayUnion(spaceRef.id), updatedAt: now })
  })
  // WS-13: 신청자에게 결과 알림 (거절이면 멤버 문서가 없으니 알림함에 바로 쓴다)
  const name = (await spaceRef.get()).get('name') ?? ''
  await db.collection(`users/${data.uid}/notifications`).add({
    spaceId: data.spaceId,
    type: 'join',
    actorId: uid,
    refPath: data.approve ? `/s/${data.spaceId}` : '/',
    title: data.approve ? `'${name}' 가입이 승인됐어요` : `'${name}' 가입 신청이 거절됐어요`,
    body: '',
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  })
  return { ok: true as const }
})
