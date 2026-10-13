import type { Firestore } from 'firebase/firestore'
import type { Mission } from '~/features/missions/services/missions'
import type { Page } from '~/features/notes/services/pages'
import { periodKeys } from '#shared/schemas/mission'
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { isFinished, listMissions, listSubmissions } from '~/features/missions/services/missions'

export interface LeadingMission {
  mission: Mission
  host: boolean
  /** 오늘까지의 마지막 회차. 아직 시작 전이면 null */
  period: string | null
  done: number
  total: number
  /** 내가 검토할 제출 수 */
  pending: number
}

async function leadingMission(db: Firestore, sid: string, uid: string, m: Mission, today: string): Promise<LeadingMission> {
  const subs = await listSubmissions(db, sid, m.id).catch(() => [])
  const until = m.endDate && m.endDate < today ? m.endDate : today
  const period = m.startDate <= until ? periodKeys(m, m.startDate, until).at(-1) ?? null : null
  const doneUids = new Set(subs.filter(s => s.periodKey === period && ['done', 'approved'].includes(s.status)).map(s => s.uid))
  return {
    mission: m,
    host: m.hostIds.includes(uid),
    period,
    done: m.participantIds.filter(u => doneUids.has(u)).length,
    total: m.participantIds.length,
    pending: subs.filter(s => s.status === 'submitted' && s.reviewerUids.includes(uid)).length,
  }
}

/** CMN-06: 진행 중인 내가 연 미션(현황)과 검토 대기가 있는 리뷰어 미션 */
export async function listLeadingMissions(db: Firestore, sid: string, uid: string, today: string): Promise<LeadingMission[]> {
  const ms = (await listMissions(db, sid, uid)).filter(m => !m.isPersonal && !isFinished(m, today) && (m.hostIds.includes(uid) || m.reviewerIds.includes(uid)))
  const out = await Promise.all(ms.map(m => leadingMission(db, sid, uid, m, today)))
  return out.filter(x => x.host || x.pending > 0).sort((a, b) => b.pending - a.pending)
}

/** CMN-06: 피드백을 요청받았고 아직 남기지 않은 글 */
export async function listFeedbackAsked(db: Firestore, sid: string, uid: string): Promise<Page[]> {
  const snap = await getDocs(query(collection(db, 'spaces', sid, 'pages'), where('deletedAt', '==', null), where('ownerStatus', '==', 'active'), where('reviewerIds', 'array-contains', uid)))
  const asked = snap.docs.map(d => ({ id: d.id, ...d.data() }) as Page).filter(p => p.ownerId !== uid)
  const given = await Promise.all(asked.map(p => getDoc(doc(db, 'spaces', sid, 'comments', `fb_${p.id}_${uid}`)).then(d => d.exists()).catch(() => false)))
  return asked.filter((_, i) => !given[i])
}
