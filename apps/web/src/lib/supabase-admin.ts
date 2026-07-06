import { createClient } from '@supabase/supabase-js'
import type { AdminEnv } from './env'

/** Client service_role — APENAS em rotas de servidor; nunca importar em client components. */
export function supabaseAdmin(env: AdminEnv) {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
}
