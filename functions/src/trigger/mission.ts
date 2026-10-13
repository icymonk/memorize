import { getFirestore } from 'firebase-admin/firestore'
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore'
import { notifyMembers } from '../lib/notify'

const nameOf = async (uid: string) => ((await getFirestore().doc(`users/${uid}`).get()).get('displayName') as string | undefined) ?? ''

/** MIS-40: 새 미션의 대상자에게 알린다. 개인 목표는 알리지 않는다 */
export const onMissionCreated = onDocumentCreated('spaces/{sid}/missions/{mid}', async (event) => {
  const m = event.data?.data()
  if (!m || m.isPersonal) return
  const { sid, mid } = event.params
  const host = await nameOf(m.createdBy)
  await notifyMembers(sid, (m.participantIds as string[]).map(uid => ({
    uid,
    type: 'mission' as const,
    actorId: m.createdBy,
    refPath: `/s/${sid}/missions/${mid}`,
    title: `${host}님이 미션 '${m.title}'에 나를 넣었어요`,
    body: '',
  })))
})

/** MIS-40: 검토할 제출이 오면 검토자에게, 승인·반려되면 제출한 사람에게 */
export const onSubmissionWritten = onDocumentWritten('spaces/{sid}/missions/{mid}/submissions/{subId}', async (event) => {
  const before = event.data?.before.data()
  const s = event.data?.after.data()
  if (!s || before?.status === s.status) return
  const { sid, mid } = event.params
  const title = ((await getFirestore().doc(`spaces/${sid}/missions/${mid}`).get()).get('title') as string | undefined) ?? ''
  const refPath = `/s/${sid}/missions/${mid}`
  if (s.status === 'submitted') {
    const who = await nameOf(s.uid)
    await notifyMembers(sid, (s.reviewerUids as string[]).map(uid => ({
      uid, type: 'missionReview' as const, actorId: s.uid, refPath, title: `${who}님이 '${title}'을(를) 제출했어요`, body: (s.content as string ?? '').slice(0, 100),
    })))
  }
  else if (s.status === 'approved' || s.status === 'rejected') {
    await notifyMembers(sid, [{
      uid: s.uid,
      type: 'mission',
      actorId: s.reviewedBy,
      refPath,
      title: `'${title}' 제출이 ${s.status === 'approved' ? '승인' : '반려'}됐어요`,
      body: (s.reason as string | undefined) ?? '',
    }])
  }
})
