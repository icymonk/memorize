import { getFirestore } from 'firebase-admin/firestore'
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore'
import { notifyMembers } from '../lib/notify'
import { addActivity } from './activity'

const nameOf = async (uid: string) =>
  ((await getFirestore().doc(`users/${uid}`).get()).get('displayName') as string | undefined) ?? ''

const COMPLETE = ['done', 'approved']

/** MIS-40: 미션 대상자에게 알림 (개인 목표 제외, 만든 사람 제외) */
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

/** MIS-30·31·40: 제출 → 검토자, 승인·반려 → 제출자. MIS-17: 완료 소식은 미션 설정대로 피드·알림 */
export const onSubmissionWritten = onDocumentWritten('spaces/{sid}/missions/{mid}/submissions/{subId}', async (event) => {
  const before = event.data?.before.data()
  const s = event.data?.after.data()
  if (!s || before?.status === s.status) return
  const { sid, mid } = event.params
  const m = (await getFirestore().doc(`spaces/${sid}/missions/${mid}`).get()).data() ?? {}
  const title = (m.title as string | undefined) ?? ''
  const refPath = `/s/${sid}/missions/${mid}`

  if (s.status === 'submitted') {
    const who = await nameOf(s.uid)
    await notifyMembers(sid, (s.reviewerUids as string[]).map(uid => ({
      uid,
      type: 'missionReview' as const,
      actorId: s.uid,
      refPath,
      title: `${who}님이 '${title}'을(를) 제출했어요`,
      body: ((s.content as string | undefined) ?? '').slice(0, 100),
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

  if (!COMPLETE.includes(s.status) || m.isPersonal) return
  const scope = (m.notifyOnComplete as string | undefined) ?? 'feed'
  if (scope === 'none') return
  await addActivity(sid, {
    uid: s.uid,
    module: 'missions',
    type: 'missionDone',
    size: 'minor',
    refType: 'mission',
    refId: mid,
    data: { title, periodKey: s.periodKey ?? '' },
    visibility: 'space',
  })
  if (scope !== 'all') return
  const who = await nameOf(s.uid)
  await notifyMembers(sid, ((m.participantIds as string[] | undefined) ?? []).filter(u => u !== s.uid).map(uid => ({
    uid,
    type: 'mission' as const,
    actorId: s.uid,
    refPath,
    title: `${who}님이 '${title}'을(를) 완료했어요`,
    body: '',
  })))
})
