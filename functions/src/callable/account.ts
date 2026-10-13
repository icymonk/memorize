import type { EnsureAccountOutput } from '../../../shared/schemas/account'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { LIMITS } from '../../../shared/limits'
import { completeOnboardingInput, ensureAccountInput, personalSpaceId } from '../../../shared/schemas/account'
import { authedCallable } from '../lib/callable'

const PERSONAL_MODULES = {
  notes: true,
  vocab: true,
  reading: true,
  reviews: true,
  courses: false,
  missions: true,
  tests: false,
  math: false,
  wrongNotes: false,
}

/** ACC-04, WS-50: 첫 로그인 시 사용자 문서와 내 공간을 만든다. 이미 있으면 상태만 돌려준다. */
export const ensureAccount = authedCallable(ensureAccountInput, async ({ uid, token, data }): Promise<EnsureAccountOutput> => {
  const db = getFirestore()
  const spaceId = personalSpaceId(uid)
  const userRef = db.doc(`users/${uid}`)

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef)
    if (snap.exists) {
      return { created: false, needsOnboarding: !snap.get('onboardedAt'), personalSpaceId: spaceId }
    }

    const now = FieldValue.serverTimestamp()
    const displayName = (typeof token.name === 'string' && token.name) || token.email?.split('@')[0] || '사용자'
    const photoURL = typeof token.picture === 'string' ? token.picture : null

    tx.create(userRef, {
      kind: 'standard',
      displayName,
      photoURL,
      bio: '',
      email: token.email ?? null,
      timezone: data.timezone,
      locale: data.locale,
      personalSpaceId: spaceId,
      spaceIds: [spaceId],
      guardianIds: [],
      wardIds: [],
      settings: {},
      storage: { usedBytes: 0, limitBytes: LIMITS.storageBytesPerUser },
      streak: { current: 0, best: 0, lastDate: null },
      onboardedAt: null,
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
    })
    tx.create(db.doc(`spaces/${spaceId}`), {
      kind: 'personal',
      name: '내 공간',
      icon: '🏠',
      color: null,
      description: '',
      ownerId: uid,
      modules: PERSONAL_MODULES,
      subjects: [],
      stamps: [],
      memberCount: 1,
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
    })
    tx.create(db.doc(`spaces/${spaceId}/members/${uid}`), {
      access: 'owner',
      status: 'active',
      displayName,
      photoURL,
      groupIds: [],
      hideProgress: false,
      schemaVersion: 1,
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    return { created: true, needsOnboarding: true, personalSpaceId: spaceId }
  })
})

/** ACC-04: 첫 가입 설정(이름, 시간대) 완료 */
export const completeOnboarding = authedCallable(completeOnboardingInput, async ({ uid, data }) => {
  const db = getFirestore()
  const now = FieldValue.serverTimestamp()
  const batch = db.batch()
  batch.update(db.doc(`users/${uid}`), {
    displayName: data.displayName,
    timezone: data.timezone,
    onboardedAt: now,
    updatedAt: now,
  })
  batch.update(db.doc(`spaces/${personalSpaceId(uid)}/members/${uid}`), {
    displayName: data.displayName,
    updatedAt: now,
  })
  await batch.commit()
  return { ok: true as const }
})
