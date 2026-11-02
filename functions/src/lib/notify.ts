import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { sendPush } from './push'

export type NotifyType = 'mention' | 'comment' | 'feedbackRequest' | 'feedback' | 'mission' | 'missionReview' | 'group' | 'test'

export interface Notice {
  uid: string
  type: NotifyType
  actorId: string
  refPath: string
  title: string
  body: string
}

/** CMN-30·31·ACC-20: 활성 멤버에게 알림함 항목과 웹 푸시. 종류별로 끈 것은 빼고, 본인 행동은 알리지 않는다 */
export async function notifyMembers(sid: string, notices: Notice[]) {
  const db = getFirestore()
  const batch = db.batch()
  let n = 0
  const pushes: Promise<unknown>[] = []
  for (const x of notices) {
    if (x.uid === x.actorId) continue
    const member = await db.doc(`spaces/${sid}/members/${x.uid}`).get()
    if (member.get('status') !== 'active') continue
    const user = await db.doc(`users/${x.uid}`).get()
    const { uid, ...rest } = x
    if (user.get(`notifications.${x.type}.push`) !== false) {
      pushes.push(sendPush(uid, { title: x.title, body: x.body, link: x.refPath }).catch(e => logger.warn('push failed', { uid, e: String(e) })))
    }
    if (user.get(`notifications.${x.type}.inApp`) === false) continue
    batch.create(db.collection(`users/${uid}/notifications`).doc(), { spaceId: sid, ...rest, read: false, createdAt: FieldValue.serverTimestamp() })
    n++
  }
  if (n) await batch.commit()
  await Promise.all(pushes)
}
