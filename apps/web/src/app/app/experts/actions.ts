'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { supabaseServer } from '@/lib/supabase/server'

export interface ActionResult {
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

  return { supabase, workspaceId }
}

/** Define o clone padrão do workspace (settings.default_expert_id). */
export async function selectExpertAction(expertId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(expertId).success) return { error: 'id inválido' }
  const { supabase, workspaceId } = await ctx()

  // valida que o clone é visível ao workspace (global ou próprio) via RLS
  const { data: expert } = await supabase.from('sales_experts').select('id').eq('id', expertId).single()
  if (!expert) return { error: 'Clone não encontrado' }

  const { data: ws } = await supabase.from('workspaces').select('settings').eq('id', workspaceId).single()
  const current = (ws?.settings ?? {}) as Record<string, unknown>
  const { error } = await supabase
    .from('workspaces')
    .update({ settings: { ...current, default_expert_id: expertId } })
    .eq('id', workspaceId)
  if (error) return { error: error.message }

  revalidatePath('/app/experts')
  revalidatePath('/app')
  return {}
}

const createCloneSchema = z.object({
  name: z.string().min(2, 'Dê um nome ao clone').max(80),
  role: z.string().max(120).optional(),
  description: z.string().min(20, 'Descreva a personalidade em pelo menos uma frase'),
  tone: z.string().min(2),
  interruption: z.enum(['discreto', 'moderado', 'ativo']),
})

function slugify(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40)
  const suffix = Math.abs(Array.from(name).reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7)).toString(36)
  return `${base || 'clone'}-${suffix}`
}

/** Cria um clone personalizado do workspace (sales_experts scope='workspace'). */
export async function createCustomExpertAction(
  input: z.infer<typeof createCloneSchema>,
): Promise<ActionResult> {
  const parsed = createCloneSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message }

  const { supabase, workspaceId } = await ctx()
  const { name, role, description, tone, interruption } = parsed.data

  // Voice DNA composto a partir das escolhas do formulário
  const stylePrompt = [
    role ? `Você atua como ${role}.` : '',
    description,
    `Tom de voz predominante: ${tone}.`,
    `Nível de interrupção: ${interruption} — ${
      interruption === 'discreto'
        ? 'só fale quando for muito relevante.'
        : interruption === 'ativo'
          ? 'sugira com frequência, sem deixar passar oportunidades.'
          : 'equilibre sugestões úteis sem sobrecarregar.'
    }`,
  ]
    .filter(Boolean)
    .join('\n')

  const { error } = await supabase.from('sales_experts').insert({
    scope: 'workspace',
    workspace_id: workspaceId,
    name,
    slug: slugify(name),
    tagline: role || 'Clone personalizado',
    bio: description.slice(0, 300),
    category: 'Seu Modelo',
    interruption,
    style_prompt: stylePrompt,
    question_frameworks: { tone, interruption },
    status: 'active',
  })
  if (error) return { error: error.message }

  redirect('/app/experts')
}
