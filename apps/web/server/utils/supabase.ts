import { createClient } from '@supabase/supabase-js'

const options = { auth: { persistSession: false, autoRefreshToken: false } }

/** For the tables. Passes RLS, so it stays on the server and never signs anybody in. */
export function dataClient() {
  const { supabaseUrl, supabaseServiceKey } = useRuntimeConfig()
  return createClient(supabaseUrl, supabaseServiceKey, options)
}

/** For one sign-in or sign-up. A client holds the session it opens, so each call gets its own. */
export function authClient() {
  const { supabaseUrl, supabaseAnonKey } = useRuntimeConfig()
  return createClient(supabaseUrl, supabaseAnonKey, options)
}
