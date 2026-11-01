import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { onDocumentUpdated } from 'firebase-functions/v2/firestore'

/** 함께 읽기에 새로 참여하면 연결 미션 참여자에도 넣는다 (나가도 미션 기록은 남긴다) */
export const onReadingGroupUpdated = onDocumentUpdated('spaces/{sid}/readingGroups/{gid}', async (event) => {
  const before: string[] = event.data?.before.get('participantIds') ?? []
  const after = event.data?.after
  const missionId = after?.get('missionId')
  const added = ((after?.get('participantIds') ?? []) as string[]).filter(u => !before.includes(u))
  if (!missionId || !added.length) return
  await getFirestore().doc(`spaces/${event.params.sid}/missions/${missionId}`).update({ participantIds: FieldValue.arrayUnion(...added) })
})
