export default defineNuxtRouteMiddleware(async (to) => {
  const signedIn = await useRequestFetch()('/api/me')
    .then(() => true)
    .catch(() => false)

  if (!signedIn && to.path !== '/login') return navigateTo('/login')
  if (signedIn && to.path === '/login') return navigateTo('/')
})
