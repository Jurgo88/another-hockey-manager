export default defineEventHandler(async (event) => {
  const { email, password } = await readBody<Record<string, unknown>>(event)
  if (typeof email !== 'string' || typeof password !== 'string') {
    throw createError({ statusCode: 400, message: 'errors.invalidLogin' })
  }

  const { data, error } = await authClient().auth.signInWithPassword({ email, password })
  if (error || !data.session) {
    throw createError({ statusCode: 401, message: 'errors.invalidLogin' })
  }

  storeSession(event, data.session)
  return { ok: true }
})
