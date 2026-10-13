import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { LIMITS } from '../../../shared/limits'

const DAY = 86_400_000
const PAGE = 100
const daily = { schedule: 'every day 04:00', timeZone: 'Asia/Seoul' }

/** NOTE-23: 휴지통에서 보관 기간이 지난 페이지를 블록·버전·댓글·반응·피드백 요청과 함께 완전 삭제 */
export async function purgeTrash(now = Date.now()) {
  const db = getFirestore()
  const cutoff = Timestamp.fromMillis(now - LIMITS.trashDays * DAY)
  let count = 0
  for (;;) {
    const snap = await db.collectionGroup('pages').where('deletedAt', '<', cutoff).limit(PAGE).get()
    for (const p of snap.docs) {
      const space = p.ref.parent.parent!
      const related = await Promise.all(['comments', 'reactions', 'feedbackRequests'].map(c => space.collection(c).where('targetId', '==', p.id).get()))
      const writer = db.bulkWriter()
      for (const s of related) for (const d of s.docs) writer.delete(d.ref)
      await writer.close()
      await db.recursiveDelete(p.ref)
      count++
    }
    if (snap.size < PAGE) return count
  }
}

/** WS-33: 삭제한 지 30일 지난 그룹을 지우고 멤버의 소속에서도 뺀다 */
export async function purgeGroups(now = Date.now()) {
  const db = getFirestore()
  const cutoff = Timestamp.fromMillis(now - LIMITS.groupRestoreDays * DAY)
  const snap = await db.collectionGroup('groups').where('deletedAt', '<', cutoff).get()
  for (const g of snap.docs) {
    const members = await g.ref.parent.parent!.collection('members').where('groupIds', 'array-contains', g.id).get()
    const writer = db.bulkWriter()
    for (const m of members.docs) writer.update(m.ref, { groupIds: FieldValue.arrayRemove(g.id) })
    writer.delete(g.ref)
    await writer.close()
  }
  return snap.size
}

/** WS-07: 유예 기간이 끝난 워크스페이스를 하위 데이터째 삭제 */
export async function purgeSpaces(now = Date.now()) {
  const db = getFirestore()
  const snap = await db.collection('spaces').where('deleteScheduledAt', '<=', Timestamp.fromMillis(now)).get()
  for (const s of snap.docs) {
    if (s.get('kind') === 'personal') continue
    await db.recursiveDelete(s.ref)
  }
  return snap.size
}

export const cronPurgeTrash = onSchedule(daily, async () => {
  logger.info('purged trash pages', { count: await purgeTrash(), groups: await purgeGroups() })
})

export const cronSpaceDeletion = onSchedule(daily, async () => {
  logger.info('deleted workspaces', { count: await purgeSpaces() })
})
