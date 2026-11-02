import { getFirestore } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'

export interface PushMessage { title: string, body: string, link: string }

const DEAD = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token', 'messaging/invalid-argument'])

/** CMN-31: 그 사람의 브라우저들에 웹 푸시. 데이터만 보내고 서비스 워커가 알림을 띄운다. 죽은 토큰은 지운다 */
export async function sendPush(uid: string, msg: PushMessage) {
  const col = getFirestore().collection(`users/${uid}/fcmTokens`)
  const tokens = (await col.get()).docs.map(d => d.id)
  if (!tokens.length) return 0
  const res = await getMessaging().sendEachForMulticast({
    tokens,
    webpush: { headers: { Urgency: 'high' }, data: { title: msg.title, body: msg.body, link: msg.link } },
  })
  await Promise.all(res.responses.map((r, i) => (!r.success && DEAD.has(r.error?.code ?? '') ? col.doc(tokens[i]!).delete() : null)))
  return res.successCount
}
