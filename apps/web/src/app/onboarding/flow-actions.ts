'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { supabaseServer } from '@/lib/supabase/server'
import { readSiteText, siteDocumentFields } from '@/lib/site-text'
import { ONBOARDING_SITE_TITLE, ONBOARDING_STEPS, type OnboardingStep } from './progress'

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
  siteUrl: z.union([z.url('URL inválida. Inclua https://'), z.literal('')]),
  description: z.string().min(20, 'Descreva a empresa em 2 a 3 frases'),
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

    await supabase.from('documents').insert({
      workspace_id: workspaceId,
      context_base_id: base.id,
      source_type: 'onboarding_profile',
      title: 'Perfil da empresa (onboarding)',
      meta: { raw_text: d.description, segment: d.segment },
    })
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

  // Site da empresa — por ÚLTIMO, depois de o Perfil já estar salvo: a leitura
  // depende de um servidor de terceiros e pode levar alguns segundos.
  // Fail-soft: site fora do ar NÃO trava o onboarding; o documento fica com
  // status 'error' + motivo, e o passo Conhecimento oferece "Tentar de novo".
  if (base && d.siteUrl) {
    const { data: existingUrl } = await supabase
      .from('documents')
      .select('id, status')
      .eq('workspace_id', workspaceId)
      .eq('context_base_id', base.id)
      .eq('source_url', d.siteUrl)
      .order('created_at')
      .limit(1)
      .maybeSingle()

    // já lido com sucesso → nada a fazer (voltar ao Perfil e salvar de novo é instantâneo)
    if (existingUrl?.status !== 'ready') {
      const fields = siteDocumentFields(await readSiteText(d.siteUrl))
      if (existingUrl) {
        await supabase.from('documents').update(fields).eq('id', existingUrl.id).eq('workspace_id', workspaceId)
      } else {
        await supabase.from('documents').insert({
          workspace_id: workspaceId,
          context_base_id: base.id,
          source_type: 'url',
          title: ONBOARDING_SITE_TITLE,
          source_url: d.siteUrl,
          ...fields,
        })
      }
    }
  }

  return {}
}

const stepSchema = z.enum(ONBOARDING_STEPS)

/**
 * Guarda em qual etapa do onboarding o usuário está. É o que permite retomar
 * de onde parou depois de um F5 ou de a conexão cair (lido por
 * `resolveInitialStep` na página).
 */
export async function saveOnboardingStepAction(step: OnboardingStep): Promise<FlowResult> {
  const parsed = stepSchema.safeParse(step)
  if (!parsed.success) return { error: 'Etapa inválida' }

  const { supabase, workspaceId } = await ctx()
  const { data: ws } = await supabase.from('workspaces').select('onboarding_state').eq('id', workspaceId).single()
  const state = (ws?.onboarding_state ?? {}) as Record<string, unknown>

  const { error } = await supabase
    .from('workspaces')
    .update({ onboarding_state: { ...state, step: parsed.data } })
    .eq('id', workspaceId)
  if (error) return { error: error.message }

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
