import type { CreateWorkspaceOutput } from '../../../shared/schemas/space'
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { LIMITS } from '../../../shared/limits'
import { can } from '../../../shared/permissions'
import { cancelSpaceDeletionInput, createWorkspaceInput, DEFAULT_SPACE_SETTINGS, scheduleSpaceDeletionInput } from '../../../shared/schemas/space'
import { authedCallable } from '../lib/callable'

/** WS-01: 워크스페이스 + 소유자 멤버를 만들고 내 공간 목록(users.spaceIds)에 넣는다 */
export const createWorkspace = authedCallable(createWorkspaceInput, async ({ uid, data }): Promise<CreateWorkspaceOutput> => {
  const db = getFirestore()
  const userRef = db.doc(`users/${uid}`)
  const spaceRef = db.collection('spaces').doc()

  await db.runTransaction(async (tx) => {
    const user = await tx.get(userRef)
    if (!user.exists) throw new HttpsError('failed-precondition', 'account not ready')

    const now = FieldValue.serverTimestamp()
    tx.create(spaceRef, {
      kind: 'workspace',
      name: data.name,
      icon: data.icon,
      color: data.color,
      description: data.description,
      ownerId: uid,
      modules: data.modules,
      settings: { ...DEFAULT_SPACE_SETTINGS, ranking: { enabled: true } },
      subjects: [],
      stamps: [],
      memberCount: 1,
      maxMembers: LIMITS.workspaceMaxMembers,
      deleteScheduledAt: null,
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
    })
    tx.create(spaceRef.collection('members').doc(uid), {
      access: 'owner',
      status: 'active',
      displayName: user.get('displayName') ?? '',
      photoURL: user.get('photoURL') ?? null,
      groupIds: [],
      hideProgress: false,
      schemaVersion: 1,
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    tx.update(userRef, { spaceIds: FieldValue.arrayUnion(spaceRef.id), updatedAt: now })
  })

  return { spaceId: spaceRef.id }
})

async function loadOwnerContext(tx: FirebaseFirestore.Transaction, spaceId: string, uid: string) {
  const db = getFirestore()
  const spaceRef = db.doc(`spaces/${spaceId}`)
  const [space, member] = await Promise.all([tx.get(spaceRef), tx.get(spaceRef.collection('members').doc(uid))])
  if (!space.exists || !member.exists) throw new HttpsError('not-found', 'space not found')
  const ctx = { kind: space.get('kind'), settings: space.get('settings'), member: { access: member.get('access'), status: member.get('status') } }
  if (!can(ctx, 'delete')) throw new HttpsError('permission-denied', 'owner only')
  return { spaceRef, space }
}

/** WS-07: 소유자가 이름을 입력해 확인하면 7일 뒤 삭제로 예약한다 (실제 삭제는 cronSpaceDeletion) */
export const scheduleSpaceDeletion = authedCallable(scheduleSpaceDeletionInput, async ({ uid, data }) => {
  const db = getFirestore()
  return db.runTransaction(async (tx) => {
    const { spaceRef, space } = await loadOwnerContext(tx, data.spaceId, uid)
    if (data.confirmName.trim() !== space.get('name')) throw new HttpsError('invalid-argument', 'name mismatch')
    const existing = space.get('deleteScheduledAt') as Timestamp | null | undefined
    if (existing) return { deleteScheduledAt: existing.toDate().toISOString() }
    const at = Timestamp.fromMillis(Date.now() + LIMITS.workspaceDeleteGraceDays * 24 * 60 * 60 * 1000)
    tx.update(spaceRef, { deleteScheduledAt: at, updatedAt: FieldValue.serverTimestamp() })
    return { deleteScheduledAt: at.toDate().toISOString() }
  })
})

/** WS-07: 유예 기간 안에 삭제 예약을 취소한다 */
export const cancelSpaceDeletion = authedCallable(cancelSpaceDeletionInput, async ({ uid, data }) => {
  const db = getFirestore()
  await db.runTransaction(async (tx) => {
    const { spaceRef } = await loadOwnerContext(tx, data.spaceId, uid)
    tx.update(spaceRef, { deleteScheduledAt: null, updatedAt: FieldValue.serverTimestamp() })
  })
  return { ok: true as const }
})
