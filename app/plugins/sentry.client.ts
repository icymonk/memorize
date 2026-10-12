/** 0-9 Sentry (D4). 운영(main) 빌드에만 DSN이 들어가고, 없으면 아무것도 하지 않는다. CDN 번들을 써서 앱 의존성을 늘리지 않는다 */
const SENTRY_SRC = 'https://browser.sentry-cdn.com/11.4.0/bundle.tracing.min.js'
const SENTRY_SRI = 'sha384-leCZtyH0v+/d38CQgHkDf/buaYk8uIH2vrAwzlLXVLKTcrvUWEUGan36c9ooM12N'

interface SentryGlobal {
  init: (options: Record<string, unknown>) => void
  captureException: (error: unknown) => void
}

export default defineNuxtPlugin((nuxtApp) => {
  const { sentryDsn } = useRuntimeConfig().public
  if (!sentryDsn) return

  const script = document.createElement('script')
  script.src = SENTRY_SRC
  script.integrity = SENTRY_SRI
  script.crossOrigin = 'anonymous'
  script.onload = () => {
    const sentry = (window as unknown as { Sentry?: SentryGlobal }).Sentry
    if (!sentry) return
    sentry.init({ dsn: sentryDsn, environment: 'production', tracesSampleRate: 0.1 })
    const previous = nuxtApp.vueApp.config.errorHandler
    nuxtApp.vueApp.config.errorHandler = (error, instance, info) => {
      sentry.captureException(error)
      if (previous) previous(error, instance, info)
      else console.error(error)
    }
  }
  document.head.appendChild(script)
})
