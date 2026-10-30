import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { finishedInPeriod } from '../../../shared/reading-groups'
import { submissionId } from '../../../shared/schemas/mission'

/** READ-44: 이 책을 함께 읽는 모임에 완독 미션이 있고 기간 안에 다 읽었으면 완료 제출을 남긴다 (이미 있으면 그대로) */
export async function completeReadingMissions(sid: string, uid: string, bookKey: string, finishedAt: string) {
  const db = getFirestore()
  const groups = await db.collection(`spaces/${sid}/readingGroups`).where('participantIds', 'array-contains', uid).get()
  await Promise.all(groups.docs.filter(g => g.get('bookKey') === bookKey && g.get('missionId')
    && finishedInPeriod(finishedAt, { startAt: g.get('startAt'), endAt: g.get('endAt') })).map(async (g) => {
    const mission = db.doc(`spaces/${sid}/missions/${g.get('missionId')}`)
    await mission.update({ participantIds: FieldValue.arrayUnion(uid) })
    await mission.collection('submissions').doc(submissionId(uid, 'once')).create({
      uid, periodKey: 'once', status: 'done', content: '', pageId: null, attachments: [], late: false, reviewerUids: [],
      submittedAt: FieldValue.serverTimestamp(),
    }).catch((e: { code?: number }) => {
      if (e.code !== 6) throw e // ALREADY_EXISTS
    })
  }))
}
