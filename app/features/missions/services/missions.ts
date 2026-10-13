import type { MissionInput, SubmissionInput, SubmissionStatus } from '#shared/schemas/mission'
import type { Firestore, Timestamp } from 'firebase/firestore'
import { initialStatus, isLate, participantsOf, reviewersFor, submissionId } from '#shared/schemas/mission'
import { addDoc, arrayUnion, collection, deleteDoc, deleteField, doc, getDoc, getDocs, or, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore'

export interface Mission extends Omit<MissionInput, 'coHostIds'> {
  id: string
  createdBy: string
  hostIds: string[]
  participantIds: string[]
  closedAt: Timestamp | null
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

const missionsOf = (db: Firestore, sid: string) => collection(db, 'spaces', sid, 'missions')

/** 규칙이 허용하는 것만: 공개 미션 + 내 개인 목표 */
export async function listMissions(db: Firestore, sid: string, uid: string): Promise<Mission[]> {
  const snap = await getDocs(query(missionsOf(db, sid), or(where('isPersonal', '==', false), where('createdBy', '==', uid))))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Mission)
}

export async function getMission(db: Firestore, sid: string, id: string): Promise<Mission | null> {
  const snap = await getDoc(doc(missionsOf(db, sid), id))
  return snap.exists() ? { id: snap.id, ...snap.data() } as Mission : null
}

function toDoc(input: MissionInput, host: string, activeMembers: string[]) {
  const { coHostIds, ...rest } = input
  return {
    ...rest,
    reviewerIds: input.isPersonal ? [] : input.reviewerIds,
    hostIds: input.isPersonal ? [host] : [...new Set([host, ...coHostIds])],
    participantIds: participantsOf(input, host, activeMembers),
  }
}

export async function createMission(db: Firestore, sid: string, uid: string, input: MissionInput, activeMembers: string[]) {
  const now = serverTimestamp()
  const ref = await addDoc(missionsOf(db, sid), { ...toDoc(input, uid, activeMembers), createdBy: uid, closedAt: null, createdAt: now, updatedAt: now })
  return ref.id
}

/** MIS-34: 수정. 참여자는 대상 설정으로 다시 계산하되, 이미 합류한 사람(열린 미션)은 남긴다 */
export async function updateMission(db: Firestore, sid: string, m: Mission, input: MissionInput, activeMembers: string[]) {
  const next = toDoc(input, m.createdBy, activeMembers)
  const joined = m.participantIds.filter(u => !participantsOf(m, m.createdBy, activeMembers).includes(u))
  await updateDoc(doc(missionsOf(db, sid), m.id), {
    ...next,
    hostIds: m.isPersonal ? [m.createdBy] : [...new Set([m.createdBy, ...input.coHostIds])],
    participantIds: [...new Set([...next.participantIds, ...joined])],
    updatedAt: serverTimestamp(),
  })
}

/** MIS-34: 조기 종료 / 다시 열기 */
export async function setMissionClosed(db: Firestore, sid: string, id: string, closed: boolean) {
  await updateDoc(doc(missionsOf(db, sid), id), { closedAt: closed ? serverTimestamp() : null, updatedAt: serverTimestamp() })
}

export async function deleteMission(db: Firestore, sid: string, id: string) {
  await deleteDoc(doc(missionsOf(db, sid), id))
}

/** 마감이 지났거나 종료된 미션 */
export const isFinished = (m: Pick<Mission, 'closedAt' | 'endDate'>, today: string) => !!m.closedAt || (!!m.endDate && m.endDate < today)

export interface Submission {
  id: string
  uid: string
  periodKey: string
  status: SubmissionStatus
  content: string
  pageId: string | null
  late: boolean
  reviewerUids: string[]
  reason?: string
  submittedAt?: Timestamp
}

const subsOf = (db: Firestore, sid: string, mid: string) => collection(db, 'spaces', sid, 'missions', mid, 'submissions')

/** 내 제출 전부 (회차별) */
export async function listMySubmissions(db: Firestore, sid: string, mid: string, uid: string): Promise<Submission[]> {
  const snap = await getDocs(query(subsOf(db, sid, mid), where('uid', '==', uid)))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Submission)
}

/** MIS-01·22·23·32: 완료 체크 또는 제출. 반려된 회차는 같은 문서로 다시 제출. 노트를 내면 진행자·리뷰어가 볼 수 있게 피드백 요청자에 더한다 */
export async function submit(db: Firestore, sid: string, m: Mission, uid: string, period: string, today: string, input: SubmissionInput = { content: '', pageId: null }) {
  const reviewerUids = reviewersFor(m, uid)
  const ref = doc(subsOf(db, sid, m.id), submissionId(uid, period))
  await setDoc(ref, {
    uid,
    periodKey: period,
    status: initialStatus(m.type, reviewerUids),
    content: input.content,
    pageId: input.pageId,
    late: isLate(m, period, today),
    reviewerUids,
    submittedAt: serverTimestamp(),
    reason: deleteField(),
  }, { merge: true })
  if (input.pageId && reviewerUids.length) {
    await updateDoc(doc(db, 'spaces', sid, 'pages', input.pageId), { reviewerIds: arrayUnion(...reviewerUids), updatedAt: serverTimestamp() })
  }
}

/** 체크 취소 / 검토 전 제출 회수 */
export async function withdraw(db: Firestore, sid: string, mid: string, uid: string, period: string) {
  await deleteDoc(doc(subsOf(db, sid, mid), submissionId(uid, period)))
}

/** MIS-21 참여하기 / MIS-24 그만두기 (열린 미션) */
export async function setJoined(db: Firestore, sid: string, m: Mission, uid: string, joined: boolean) {
  await updateDoc(doc(missionsOf(db, sid), m.id), {
    participantIds: joined ? [...m.participantIds, uid] : m.participantIds.filter(u => u !== uid),
  })
}
