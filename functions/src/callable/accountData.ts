import type { DocumentSnapshot, Firestore } from 'firebase-admin/firestore'
import type { ExportMyDataOutput, ExportedSpace } from '../../../shared/schemas/account'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { deleteAccountInput, personalSpaceId } from '../../../shared/schemas/account'
import { authedCallable } from '../lib/callable'

export const LEFT_NAME = '탈퇴한 사용자'

/** Timestamp → ISO 문자열로 바꿔 JSON으로 내보낼 수 있게 */
function plain(v: unknown): unknown {
  if (v instanceof Timestamp) return v.toDate().toISOString()
  if (Array.isArray(v)) return v.map(plain)
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]))
  return v
}
const row = (d: DocumentSnapshot) => ({ id: d.id, ...(plain(d.data() ?? {}) as Record<string, unknown>) })

/** 내 공간 + 참여 중인 공간 + 나간 공간 */
export async function spacesOf(db: Firestore, uid: string) {
  const user = await db.doc(`users/${uid}`).get()
  const sids = [...new Set([personalSpaceId(uid), ...(user.get('spaceIds') ?? []) as string[], ...Object.keys(user.get('formerSpaces') ?? {})])]
  return { user, sids }
}

/** ACC-40: 내가 쓴 노트·학습일지·독후감(블록 포함), 단어장(카드 포함), 책장·독서 기록·구절을 JSON으로 */
export const exportMyData = authedCallable(z.object({}), async ({ uid }): Promise<ExportMyDataOutput> => {
  const db = getFirestore()
  const { user, sids } = await spacesOf(db, uid)
  const spaces = await Promise.all(sids.map(async (sid): Promise<ExportedSpace | null> => {
    const ref = db.doc(`spaces/${sid}`)
    const mine = (c: string) => ref.collection(c).where('uid', '==', uid).get()
    const [space, pages, decks, shelf, logs, quotes] = await Promise.all([
      ref.get(),
      ref.collection('pages').where('ownerId', '==', uid).get(),
      ref.collection('decks').where('createdBy', '==', uid).get(),
      mine('shelf'),
      mine('readingLogs'),
      mine('quotes'),
    ])
    if (!space.exists) return null
    return {
      id: sid,
      name: space.get('name') ?? '',
      kind: space.get('kind') ?? '',
      pages: await Promise.all(pages.docs.filter(p => !p.get('deletedAt')).map(async p => ({ ...row(p), blocks: (await p.ref.collection('blocks').get()).docs.map(row) }))),
      decks: await Promise.all(decks.docs.filter(d => !d.get('deletedAt')).map(async d => ({ ...row(d), cards: (await d.ref.collection('cards').get()).docs.map(row) }))),
      shelf: shelf.docs.map(row),
      readingLogs: logs.docs.map(row),
      quotes: quotes.docs.map(row),
    }
  }))
  const { spaceIds: _s, formerSpaces: _f, ...profile } = plain(user.data() ?? {}) as Record<string, unknown>
  return { exportedAt: new Date().toISOString(), profile, spaces: spaces.filter(x => x !== null) }
})

/**
 * ACC-41: 소유한 워크스페이스가 없으면 탈퇴. 워크스페이스 멤버 문서는 "탈퇴한 사용자"로 바꿔 남기고(공유 콘텐츠의 작성자 이름),
 * 로그인 계정을 지운 뒤 accountDeletions/{uid}를 남긴다. 데이터 삭제는 onAccountDeletion이 이어서 한다 (Hosting 60초 제한)
 */
export const deleteAccount = authedCallable(deleteAccountInput, async ({ uid, data }) => {
  const db = getFirestore()
  const { user, sids } = await spacesOf(db, uid)
  if (((user.get('wardIds') ?? []) as string[]).length) throw new HttpsError('failed-precondition', 'has-wards')
  const workspaces = sids.filter(s => s !== personalSpaceId(uid))
  const members = await Promise.all(workspaces.map(async sid => ({ sid, space: await db.doc(`spaces/${sid}`).get(), me: await db.doc(`spaces/${sid}/members/${uid}`).get() })))
  const owned = members.filter(m => m.me.get('status') === 'active' && m.me.get('access') === 'owner' && !m.space.get('deleteScheduledAt'))
  if (owned.length) throw new HttpsError('failed-precondition', 'owns-workspaces', { names: owned.map(m => String(m.space.get('name') ?? m.sid)) })

  const now = FieldValue.serverTimestamp()
  const batch = db.batch()
  for (const { space, me } of members) {
    if (!me.exists) continue
    const active = me.get('status') === 'active'
    batch.update(me.ref, { status: active ? 'left' : me.get('status'), access: 'member', displayName: LEFT_NAME, photoURL: null, accountDeleted: true, leftAt: me.get('leftAt') ?? now, updatedAt: now })
    if (active && space.exists) batch.update(space.ref, { memberCount: FieldValue.increment(-1), ...(space.get('ownershipTransfer.to') === uid ? { ownershipTransfer: null } : {}), updatedAt: now })
  }
  batch.set(db.doc(`accountDeletions/${uid}`), { sids, deleteShared: data.deleteShared, requestedAt: now })
  await batch.commit()
  await getAuth().deleteUser(uid)
  return { ok: true as const }
})
