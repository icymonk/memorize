/* CMN-31 웹 푸시 서비스 워커. Firebase 설정은 등록할 때 ?c=로 받는다 */
self.addEventListener('notificationclick', (event) => {
  const link = event.notification.data && event.notification.data.link
  if (!link) return
  event.notification.close()
  event.waitUntil(self.clients.openWindow(new URL(link, self.location.origin).href))
})

const config = new URL(self.location.href).searchParams.get('c')
if (config) {
  importScripts(
    'https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js',
  )
  firebase.initializeApp(JSON.parse(config))
  firebase.messaging().onBackgroundMessage((payload) => {
    const d = payload.data || {}
    return self.registration.showNotification(d.title || 'memorize', { body: d.body || '', icon: '/favicon.ico', data: { link: d.link || '/' } })
  })
}
