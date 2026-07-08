import { notFound } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'

/**
 * Lista de e-mails com acesso ao backoffice, vinda da env `SUPERADMIN_EMAILS`
 * (CSV). Comparação sempre em lowercase/trim — não-manipulável via banco.
 */
function allowlist(): string[] {
  return (process.env.SUPERADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

/** Helper puro: usado tanto pelo guard do backoffice quanto pelo link discreto no nav do app. */
export function isSuperadmin(email: string | null | undefined): boolean {
  if (!email) return false
  return allowlist().includes(email.trim().toLowerCase())
}

/**
 * Guard server-side das rotas /backoffice. Quem não está na allowlist recebe
 * 404 — a rota não revela nem que existe para quem não tem acesso.
 */
export async function requireSuperadmin(): Promise<{ email: string; userId: string }> {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email || !isSuperadmin(user.email)) notFound()

  return { email: user.email, userId: user.id }
}
