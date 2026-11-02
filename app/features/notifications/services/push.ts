import type { FirebaseApp } from 'firebase/app'
import type { Firestore } from 'firebase/firestore'
import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { deleteToken, getMessaging, getToken, isSupported } from 'firebase/messaging'

/** CMN-31 웹 푸시: 이 브라우저의 토큰을 users/{uid}/fcmTokens에 등록 */
const KEY = 'memorize.pushToken'
const SCOPE = '/firebase-cloud-messaging-push-scope'

export async function pushSupported() {
  return 'Notification' in window && 'serviceWorker' in navigator && await isSupported().catch(() => false)
}
export const savedPushToken = () => localStorage.getItem(KEY)

function register(app: FirebaseApp) {
  return navigator.serviceWorker.register(`/firebase-messaging-sw.js?c=${encodeURIComponent(JSON.stringify(app.options))}`, { scope: SCOPE })
}

export async function enablePush(app: FirebaseApp, db: Firestore, uid: string, vapidKey: string): Promise<boolean> {
  if (await Notification.requestPermission() !== 'granted') return false
  const token = await getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration: await register(app) })
  await setDoc(doc(db, 'users', uid, 'fcmTokens', token), { platform: 'web', createdAt: serverTimestamp() })
  localStorage.setItem(KEY, token)
  return true
}

export async function disablePush(app: FirebaseApp, db: Firestore, uid: string) {
  const token = savedPushToken()
  localStorage.removeItem(KEY)
  if (token) await deleteDoc(doc(db, 'users', uid, 'fcmTokens', token)).catch(() => {})
  await register(app).then(() => deleteToken(getMessaging(app))).catch(() => {})
}
