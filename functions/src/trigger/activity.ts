import { FieldValue, getFirestore } from 'firebase-admin/firestore'

export interface ActivityInput {
  uid: string
  module: 'vocab' | 'notes' | 'missions'
  type: string
  size: 'major' | 'minor'
  refType: string
  refId: string | null
  data: Record<string, unknown>
  visibility: 'space' | 'private'
  at?: Date
}

/** 사용자 시간대 기준 YYYY-MM-DD (없으면 서울) */
export function ymdIn(timezone: unknown, at: Date): string {
  const timeZone = typeof timezone === 'string' && timezone ? timezone : 'Asia/Seoul'
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone }).format(at)
  }
  catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(at)
  }
}

/** CMN-10: 피드 활동은 서버만 만든다 (data-model.md `activities`) */
export async function addActivity(sid: string, a: ActivityInput) {
  const db = getFirestore()
  const at = a.at ?? new Date()
  const tz = (await db.doc(`users/${a.uid}`).get()).get('timezone')
  const { at: _at, ...rest } = a
  await db.collection(`spaces/${sid}/activities`).add({ ...rest, date: ymdIn(tz, at), createdAt: FieldValue.serverTimestamp() })
}
