import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Client service_role — SOMENTE em server actions/route handlers.
 * Usado para Storage (buckets sem policies de cliente). Nunca importar
 * em componentes client: a key não existe no bundle do browser.
 */
export function supabaseAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}
