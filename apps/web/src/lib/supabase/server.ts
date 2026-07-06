import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

type CookieToSet = { name: string; value: string; options: CookieOptions }

/** Client Supabase escopado ao usuário logado (RLS ativa). Uso em RSC/actions/routes. */
export async function supabaseServer() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // chamado de um Server Component: o middleware renova a sessão
          }
        },
      },
    },
  )
}
