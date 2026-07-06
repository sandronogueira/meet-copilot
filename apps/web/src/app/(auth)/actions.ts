'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { z } from 'zod'
import { supabaseServer } from '@/lib/supabase/server'

export interface AuthFormState {
  error?: string
  ok?: string
}

const credentialsSchema = z.object({
  email: z.email('E-mail inválido'),
  password: z.string().min(8, 'Senha precisa de pelo menos 8 caracteres'),
})

async function origin(): Promise<string> {
  const h = await headers()
  return `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`
}

export async function signInAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  const supabase = await supabaseServer()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) return { error: 'E-mail ou senha incorretos' }

  redirect('/app')
}

export async function signUpAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  const fullName = String(formData.get('full_name') ?? '').trim()
  const supabase = await supabaseServer()

  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: {
      emailRedirectTo: `${await origin()}/auth/callback`,
      data: fullName ? { full_name: fullName } : undefined,
    },
  })
  if (error) return { error: error.message }

  // Com confirmação de e-mail ativa não há sessão ainda
  if (!data.session) {
    return { ok: 'Conta criada! Confira seu e-mail para confirmar o acesso.' }
  }
  redirect('/onboarding')
}

export async function googleAction(): Promise<void> {
  const supabase = await supabaseServer()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${await origin()}/auth/callback` },
  })
  if (error || !data.url) {
    redirect('/login?error=google')
  }
  redirect(data.url)
}

export async function signOutAction(): Promise<void> {
  const supabase = await supabaseServer()
  await supabase.auth.signOut()
  redirect('/login')
}
