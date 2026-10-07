const PUBLIC_PATHS = new Set(['/', '/login', '/login/finish', '/login/child'])

export default defineNuxtRouteMiddleware(async (to) => {
  const auth = useAuthStore()
  await auth.init()

  const isPublic = PUBLIC_PATHS.has(to.path) || to.path.startsWith('/invite/')

  if (!auth.user) {
    return isPublic ? undefined : navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }

  if (to.path === '/login' || to.path === '/login/child') {
    return navigateTo(typeof to.query.redirect === 'string' ? to.query.redirect : '/')
  }

  const account = await auth.ensureAccount()
  if (account?.needsOnboarding && to.path !== '/welcome' && to.path !== '/login/finish') {
    return navigateTo({ path: '/welcome', query: { redirect: to.fullPath } })
  }
  if (to.path === '/welcome' && account && !account.needsOnboarding) {
    return navigateTo('/')
  }
})
