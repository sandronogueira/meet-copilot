import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import { loadLlmKeyState } from '@/lib/llm-keys'
import { IaForm } from './ia-form'

export const dynamic = 'force-dynamic'
// A action testa a chave na Anthropic antes de guardar (até 15s de rede de terceiros).
export const maxDuration = 30

/** "IA do copiloto": o cliente conecta a conta de IA da empresa (chave própria). */
export default async function IaPage() {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_workspace_id')
    .eq('user_id', user.id)
    .single()
  if (!profile?.default_workspace_id) redirect('/login')

  const state = await loadLlmKeyState(profile.default_workspace_id as string)
  return <IaForm state={state} />
}
