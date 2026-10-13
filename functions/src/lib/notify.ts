import { FieldValue, getFirestore } from 'firebase-admin/firestore'

export type NotifyType = 'mention' | 'comment' | 'feedbackRequest' | 'feedback' | 'mission' | 'missionReview'

export interface Notice {
  uid: string
  type: NotifyType
  actorId: string
  refPath: string
  title: string
  body: string
}

/** CMN-30·ACC-20: 활성 멤버이고 그 종류를 끄지 않은 사람에게만 알림함 항목을 만든다. 본인 행동은 알리지 않는다 */
export async function notifyMembers(sid: string, notices: Notice[]) {
  const db = getFirestore()
  const batch = db.batch()
  let n = 0
  for (const x of notices) {
    if (x.uid === x.actorId) continue
    const member = await db.doc(`spaces/${sid}/members/${x.uid}`).get()
    if (member.get('status') !== 'active') continue
    if ((await db.doc(`users/${x.uid}`).get()).get(`notifications.${x.type}.inApp`) === false) continue
    const { uid, ...rest } = x
    batch.create(db.collection(`users/${uid}/notifications`).doc(), { spaceId: sid, ...rest, read: false, createdAt: FieldValue.serverTimestamp() })
    n++
  }
  if (n) await batch.commit()
}
