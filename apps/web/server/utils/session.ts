import type { Session } from '@supabase/supabase-js'
import type { H3Event } from 'h3'

const ACCESS_COOKIE = 'ahm_access'
const REFRESH_COOKIE = 'ahm_refresh'
const THIRTY_DAYS = 60 * 60 * 24 * 30

export interface SignedInManager {
  id: string
  name: string
}

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: !import.meta.dev,
  path: '/',
  maxAge: THIRTY_DAYS,
} as const

export function storeSession(event: H3Event, session: Session): void {
  setCookie(event, ACCESS_COOKIE, session.access_token, cookieOptions)
  setCookie(event, REFRESH_COOKIE, session.refresh_token, cookieOptions)
}

export function endSession(event: H3Event): void {
  deleteCookie(event, ACCESS_COOKIE, { path: '/' })
  deleteCookie(event, REFRESH_COOKIE, { path: '/' })
}

/** The account behind the cookies, renewing an expired session once. */
async function accountId(event: H3Event): Promise<string | null> {
  const auth = authClient().auth
  const access = getCookie(event, ACCESS_COOKIE)
  if (access) {
    // eslint-disable-next-line no-restricted-syntax -- Supabase's name for it (D-07).
    const { data } = await auth.getUser(access)
    if (data.user) return data.user.id
  }

  const refresh = getCookie(event, REFRESH_COOKIE)
  if (!refresh) return null
  const { data } = await auth.refreshSession({ refresh_token: refresh })
  if (!data.session || !data.user) return null
  storeSession(event, data.session)
  return data.user.id
}

export async function currentManager(event: H3Event): Promise<SignedInManager | null> {
  const id = await accountId(event)
  if (!id) return null

  const { data, error } = await dataClient()
    .from('managers')
    .select('id, name')
    .eq('auth_id', id)
    .maybeSingle<SignedInManager>()
  if (error) throw createError({ statusCode: 500, message: error.message })
  return data
}

export async function requireManager(event: H3Event): Promise<SignedInManager> {
  const manager = await currentManager(event)
  if (!manager) throw createError({ statusCode: 401, message: 'errors.signedOut' })
  return manager
}
