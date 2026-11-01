const MIN_PASSWORD_LENGTH = 8

export default defineEventHandler(async (event) => {
  const { email, password, name } = await readBody<Record<string, unknown>>(event)
  if (
    typeof email !== 'string' ||
    typeof password !== 'string' ||
    typeof name !== 'string' ||
    name.trim() === '' ||
    password.length < MIN_PASSWORD_LENGTH
  ) {
    throw createError({ statusCode: 400, message: 'errors.invalidSignup' })
  }

  const { data, error } = await authClient().auth.signUp({ email, password })
  if (error || !data.session || !data.user) {
    throw createError({ statusCode: 400, message: 'errors.signupFailed' })
  }

  const created = await dataClient()
    .from('managers')
    .insert({ auth_id: data.user.id, name: name.trim() })
  if (created.error) throw createError({ statusCode: 500, message: created.error.message })

  storeSession(event, data.session)
  return { ok: true }
})
