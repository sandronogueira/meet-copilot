'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { supabaseServer } from '@/lib/supabase/server'

export interface FlowResult {
  error?: string
}

async function ctx() {
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
  const workspaceId = profile?.default_workspace_id as string | null
  if (!workspaceId) redirect('/login')

  return { supabase, user, workspaceId }
}

const profileSchema = z.object({
  fullName: z.string().min(2, 'Conta pra gente seu nome'),
  selfLabel: z.string().min(2, 'Como você aparece nas reuniões?'),
  siteUrl: z.union([z.url('URL inválida — inclua https://'), z.literal('')]),
  description: z.string().min(20, 'Descreva a empresa em 2–3 frases'),
  segment: z.string().min(2, 'Qual o segmento?'),
  methodology: z.string().min(2),
  tone: z.string().min(2),
  objections: z.array(z.string()).max(12).default([]),
  icp: z.string().min(10, 'Descreva seu cliente ideal em uma frase'),
})

/** Passo "Perfil" do onboarding — grava perfil + empresa + abordagem de uma vez. */
export async function saveProfileStep(input: z.infer<typeof profileSchema>): Promise<FlowResult> {
  const parsed = profileSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message }

  const { supabase, user, workspaceId } = await ctx()
  const d = parsed.data

  const { error: profErr } = await supabase
    .from('profiles')
    .update({ full_name: d.fullName, self_label: d.selfLabel })
    .eq('user_id', user.id)
  if (profErr) return { error: profErr.message }

  // Base de contexto padrão recebe o perfil da empresa + site
  const { data: base } = await supabase
    .from('context_bases')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('is_default', true)
    .single()

  if (base) {
    // evita duplicar o perfil se o usuário voltar e salvar de novo
    await supabase
      .from('documents')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('context_base_id', base.id)
      .eq('source_type', 'onboarding_profile')

    const docs: Array<Record<string, unknown>> = [
      {
        workspace_id: workspaceId,
        context_base_id: base.id,
        source_type: 'onboarding_profile',
        title: 'Perfil da empresa (onboarding)',
        meta: { raw_text: d.description, segment: d.segment },
      },
    ]
    if (d.siteUrl) {
      const { data: existingUrl } = await supabase
        .from('documents')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('context_base_id', base.id)
        .eq('source_url', d.siteUrl)
        .maybeSingle()
      if (!existingUrl) {
        docs.push({
          workspace_id: workspaceId,
          context_base_id: base.id,
          source_type: 'url',
          title: 'Site da empresa',
          source_url: d.siteUrl,
          meta: {},
        })
      }
    }
    await supabase.from('documents').insert(docs)
  }

  // sales_profile (abordagem) → prefixo cacheado do gerador
  const { data: ws } = await supabase.from('workspaces').select('settings, onboarding_state').eq('id', workspaceId).single()
  const settings = (ws?.settings ?? {}) as Record<string, unknown>
  const state = (ws?.onboarding_state ?? {}) as Record<string, unknown>

  const { error: wsErr } = await supabase
    .from('workspaces')
    .update({
      settings: {
        ...settings,
        sales_profile: {
          methodology: d.methodology,
          tone: d.tone,
          objections: d.objections,
          icp: d.icp,
        },
      },
      onboarding_state: { ...state, perfil: true },
    })
    .eq('id', workspaceId)
  if (wsErr) return { error: wsErr.message }

  return {}
}

/** Conclui o onboarding e leva ao painel. */
export async function completeOnboardingAction(): Promise<FlowResult> {
  const { supabase, workspaceId } = await ctx()
  const { error } = await supabase
    .from('workspaces')
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq('id', workspaceId)
  if (error) return { error: error.message }
  redirect('/app')
}
