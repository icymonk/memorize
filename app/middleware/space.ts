/** /s/:spaceId 아래: 활성 멤버가 아니면 첫 화면으로 (docs/dev/routing.md 4절) */
export default defineNuxtRouteMiddleware(async (to) => {
  const space = useSpaceStore()
  if (!('spaceId' in to.params) || !(await space.enter(to.params.spaceId))) {
    return navigateTo({ path: '/', query: { notice: 'noAccess' } })
  }
})
