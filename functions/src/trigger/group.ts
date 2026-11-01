import { getFirestore } from 'firebase-admin/firestore'
import { onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { notifyMembers } from '../lib/notify'

/** WS-33: 그룹을 지우면 그룹 멤버와 만든 사람에게 알림 (30일 안에 복원 가능) */
export const onGroupUpdated = onDocumentUpdated('spaces/{sid}/groups/{gid}', async (event) => {
  const before = event.data?.before.data()
  const g = event.data?.after.data()
  if (!g || before?.deletedAt || !g.deletedAt || typeof g.deletedBy !== 'string') return
  const { sid, gid } = event.params
  const db = getFirestore()
  const [members, actor] = await Promise.all([
    db.collection(`spaces/${sid}/members`).where('groupIds', 'array-contains', gid).get(),
    db.doc(`users/${g.deletedBy}`).get(),
  ])
  const uids = [...new Set([...members.docs.map(m => m.id), g.createdBy as string])]
  const name = actor.get('displayName') ?? ''
  await notifyMembers(sid, uids.map(uid => ({
    uid,
    type: 'group' as const,
    actorId: g.deletedBy,
    refPath: `/s/${sid}/members`,
    title: `${name}님이 그룹 '${g.name}'을(를) 삭제했어요`,
    body: '30일 안에 멤버 화면의 그룹 탭에서 복원할 수 있어요.',
  })))
})
