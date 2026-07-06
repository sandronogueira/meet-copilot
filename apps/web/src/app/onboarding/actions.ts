'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { supabaseServer } from '@/lib/supabase/server'

export interface StepResult {
  error?: string
}

/** Contexto comum: usuário logado + workspace padrão (RLS ativa em tudo). */
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

/** Merge raso em colunas jsonb (onboarding_state / settings). */
async function mergeWorkspaceJson(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  workspaceId: string,
  column: 'onboarding_state' | 'settings',
  patch: Record<string, unknown>,
): Promise<string | null> {
  const { data: ws, error: readError } = await supabase
    .from('workspaces')
    .select(column)
    .eq('id', workspaceId)
    .single()
  if (readError) return readError.message

  const current = (ws as Record<string, unknown>)[column] as Record<string, unknown> | null
  const { error } = await supabase
    .from('workspaces')
    .update({ [column]: { ...(current ?? {}), ...patch } })
    .eq('id', workspaceId)
  return error?.message ?? null
}

// ── Passo 1: você ────────────────────────────────────────────────────────────

const step1Schema = z.object({
  fullName: z.string().min(2, 'Conta pra gente seu nome'),
  selfLabel: z.string().min(2, 'Como você aparece nas reuniões?'),
})

export async function saveStep1(input: z.infer<typeof step1Schema>): Promise<StepResult> {
  const parsed = step1Schema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message }

  const { supabase, user, workspaceId } = await ctx()
  const { error } = await supabase
    .from('profiles')
    .update({ full_name: parsed.data.fullName, self_label: parsed.data.selfLabel })
    .eq('user_id', user.id)
  if (error) return { error: error.message }

  const mergeError = await mergeWorkspaceJson(supabase, workspaceId, 'onboarding_state', {
    step1: parsed.data,
  })
  return mergeError ? { error: mergeError } : {}
}

// ── Passo 2: sua empresa (alimenta a Base de Contexto) ──────────────────────

const step2Schema = z.object({
  siteUrl: z.union([z.url('URL inválida — inclua https://'), z.literal('')]),
  description: z.string().min(30, 'Capricha: pelo menos 2–3 frases sobre a empresa'),
  segment: z.string().min(2, 'Qual o segmento?'),
})

export async function saveStep2(input: z.infer<typeof step2Schema>): Promise<StepResult> {
  const parsed = step2Schema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message }

  const { supabase, workspaceId } = await ctx()

  const { data: base, error: baseError } = await supabase
    .from('context_bases')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('is_default', true)
    .single()
  if (baseError || !base) return { error: 'Base de contexto não encontrada' }

  const docs = [
    {
      workspace_id: workspaceId,
      context_base_id: base.id,
      source_type: 'onboarding_profile',
      title: 'Perfil da empresa (onboarding)',
      meta: { raw_text: parsed.data.description, segment: parsed.data.segment },
    },
    ...(parsed.data.siteUrl
      ? [
          {
            workspace_id: workspaceId,
            context_base_id: base.id,
            source_type: 'url',
            title: 'Site da empresa',
            source_url: parsed.data.siteUrl,
            meta: {},
          },
        ]
      : []),
  ]

  const { error } = await supabase.from('documents').insert(docs)
  if (error) return { error: error.message }

  const mergeError = await mergeWorkspaceJson(supabase, workspaceId, 'onboarding_state', {
    step2: parsed.data,
  })
  return mergeError ? { error: mergeError } : {}
}

// ── Passo 3: o que você vende ────────────────────────────────────────────────

const step3Schema = z.object({
  products: z.string().min(10, 'Liste pelo menos um produto/serviço'),
  ticket: z.string().min(1, 'Qual a faixa de ticket?'),
  pricingNotes: z.string(),
})

export async function saveStep3(input: z.infer<typeof step3Schema>): Promise<StepResult> {
  const parsed = step3Schema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message }

  const { supabase, workspaceId } = await ctx()

  const { data: base } = await supabase
    .from('context_bases')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('is_default', true)
    .single()

  if (base) {
    const raw = `Produtos/serviços:\n${parsed.data.products}\n\nTicket médio: ${parsed.data.ticket}\n\nPreços/observações:\n${parsed.data.pricingNotes || '—'}`
    const { error } = await supabase.from('documents').insert({
      workspace_id: workspaceId,
      context_base_id: base.id,
      source_type: 'pricing_table',
      title: 'Oferta e preços (onboarding)',
      meta: { raw_text: raw },
    })
    if (error) return { error: error.message }
  }

  const mergeError = await mergeWorkspaceJson(supabase, workspaceId, 'onboarding_state', {
    step3: parsed.data,
  })
  return mergeError ? { error: mergeError } : {}
}

// ── Passo 4: como você vende ─────────────────────────────────────────────────

const step4Schema = z.object({
  methodology: z.string().min(2),
  tone: z.string().min(2),
  objections: z.array(z.string()).max(12),
  icp: z.string().min(10, 'Descreva seu cliente ideal em uma frase'),
})

export async function saveStep4(input: z.infer<typeof step4Schema>): Promise<StepResult> {
  const parsed = step4Schema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message }

  const { supabase, workspaceId } = await ctx()

  // sales_profile entra no prefixo cacheado do gerador (F3)
  const salesError = await mergeWorkspaceJson(supabase, workspaceId, 'settings', {
    sales_profile: parsed.data,
  })
  if (salesError) return { error: salesError }

  const mergeError = await mergeWorkspaceJson(supabase, workspaceId, 'onboarding_state', {
    step4: parsed.data,
  })
  return mergeError ? { error: mergeError } : {}
}

// ── Passo 5: seu Especialista + conclusão ────────────────────────────────────

const step5Schema = z.object({ expertId: z.uuid('Escolha um Especialista') })

export async function saveStep5(input: z.infer<typeof step5Schema>): Promise<StepResult> {
  const parsed = step5Schema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message }

  const { supabase, workspaceId } = await ctx()

  const settingsError = await mergeWorkspaceJson(supabase, workspaceId, 'settings', {
    default_expert_id: parsed.data.expertId,
  })
  if (settingsError) return { error: settingsError }

  const { error } = await supabase
    .from('workspaces')
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq('id', workspaceId)
  if (error) return { error: error.message }

  redirect('/app')
}
