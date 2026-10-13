import type { MissionInput } from '#shared/schemas/mission'
import type { Firestore, Timestamp } from 'firebase/firestore'
import { participantsOf } from '#shared/schemas/mission'
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, or, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'

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
