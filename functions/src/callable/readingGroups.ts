import type { CreateGroupMissionOutput } from '../../../shared/reading-groups'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { createGroupMissionInput } from '../../../shared/reading-groups'
import { authedCallable } from '../lib/callable'
import { completeReadingMissions } from '../lib/readingMissions'

/** READ-44·MIS-16 함께 읽기에서 "기간 내 완독" 미션 만들기 (진행자, 모임마다 하나). 이미 기간 안에 다 읽은 참여자는 바로 완료 */
export const createReadingGroupMission = authedCallable(createGroupMissionInput, async ({ uid, data }): Promise<CreateGroupMissionOutput> => {
  const db = getFirestore()
  const spaceRef = db.doc(`spaces/${data.spaceId}`)
  const groupRef = spaceRef.collection('readingGroups').doc(data.groupId)
  const [space, member, g] = await Promise.all([spaceRef.get(), spaceRef.collection('members').doc(uid).get(), groupRef.get()])
  if (!space.exists || member.get('status') !== 'active' || !g.exists) throw new HttpsError('not-found', 'group not found')
  if (space.get('kind') !== 'workspace' || space.get('modules')?.missions !== true) throw new HttpsError('failed-precondition', 'missions off')
  if (!(g.get('hostIds') ?? []).includes(uid)) throw new HttpsError('permission-denied', 'not a host')
  if (g.get('missionId') || g.get('closedAt')) throw new HttpsError('failed-precondition', 'already linked')

  const ref = spaceRef.collection('missions').doc()
  const now = FieldValue.serverTimestamp()
  const participants: string[] = g.get('participantIds') ?? []
  const batch = db.batch()
  batch.set(ref, {
    title: `'${g.get('book.title') ?? ''}' 기간 내 완독`,
    description: '',
    type: 'auto',
    autoRule: { kind: 'readingFinish', targetId: g.id, threshold: null },
    linked: { type: 'readingGroup', id: g.id },
    recurrence: { kind: 'once', weekdays: [] },
    startDate: g.get('startAt'),
    endDate: g.get('endAt'),
    allowLate: false,
    assignees: g.get('assignees') ?? { all: true, uids: [], groupIds: [] },
    includeSelf: true,
    joinable: false,
    isPersonal: false,
    notifyOnComplete: 'feed',
    participantIds: participants,
    createdBy: uid,
    hostIds: g.get('hostIds') ?? [uid],
    reviewerIds: [],
    closedAt: null,
    createdAt: now,
    updatedAt: now,
  })
  batch.update(groupRef, { missionId: ref.id, updatedAt: now })
  await batch.commit()

  const shelves = await db.getAll(...participants.map(p => spaceRef.collection('shelf').doc(`${p}_${g.get('bookKey')}`)))
  await Promise.all(shelves.filter(s => s.get('status') === 'done' && typeof s.get('finishedAt') === 'string')
    .map(s => completeReadingMissions(data.spaceId, s.get('uid'), g.get('bookKey'), s.get('finishedAt'))))
  return { missionId: ref.id }
})
