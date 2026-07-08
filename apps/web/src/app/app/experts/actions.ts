'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { supabaseServer } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

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

const MAX_AVATAR_BYTES = 5 * 1024 * 1024

/**
 * Upload da foto/thumbnail do clone → bucket público `avatars`.
 * Retorna a URL pública para o form anexar no createCustomExpertAction.
 */
export async function uploadExpertAvatarAction(
  formData: FormData,
): Promise<ActionResult & { url?: string }> {
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'Selecione uma imagem' }
  if (file.size > MAX_AVATAR_BYTES) return { error: 'Imagem acima de 5MB' }
  if (!/^image\/(png|jpe?g|webp|gif|avif)$/.test(file.type)) {
    return { error: 'Formato inválido — envie PNG, JPG, WEBP, GIF ou AVIF' }
  }

  const { workspaceId } = await ctx()
  const admin = supabaseAdmin()
  if (!admin) return { error: 'Upload indisponível no momento (storage não configurado)' }

  const ext = (file.type.split('/')[1] ?? 'png').replace('jpeg', 'jpg')
  const path = `experts/${workspaceId}/${crypto.randomUUID()}.${ext}`
  const { error } = await admin.storage.from('avatars').upload(path, Buffer.from(await file.arrayBuffer()), {
    contentType: file.type,
    upsert: false,
  })
  if (error) return { error: error.message }

  const { data } = admin.storage.from('avatars').getPublicUrl(path)
  return { url: data.publicUrl }
}

const createCloneSchema = z.object({
  name: z.string().min(2, 'Dê um nome ao clone').max(80),
  role: z.string().max(120).optional(),
  description: z.string().min(20, 'Descreva a personalidade em pelo menos uma frase'),
  tone: z.string().min(2),
  interruption: z.enum(['discreto', 'moderado', 'ativo']),
  avatarUrl: z.url().optional(),
})

/** Voice DNA composto a partir das escolhas do formulário. */
function composeStylePrompt(
  role: string | undefined,
  description: string,
  tone: string,
  interruption: 'discreto' | 'moderado' | 'ativo',
): string {
  return [
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
}

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
  const { name, role, description, tone, interruption, avatarUrl } = parsed.data

  const { error } = await supabase.from('sales_experts').insert({
    scope: 'workspace',
    workspace_id: workspaceId,
    name,
    slug: slugify(name),
    tagline: role || 'Clone personalizado',
    bio: description.slice(0, 300),
    category: 'Seu Modelo',
    interruption,
    avatar_url: avatarUrl ?? null,
    style_prompt: composeStylePrompt(role, description, tone, interruption),
    // description completa guardada aqui → edição sem perda (bio é truncado)
    question_frameworks: { tone, interruption, description },
    status: 'active',
  })
  if (error) return { error: error.message }

  redirect('/app/experts')
}

const updateCloneSchema = createCloneSchema.extend({
  id: z.uuid(),
  /** null = remover a foto · undefined = manter a atual */
  avatarUrl: z.url().nullish(),
})

/** Edita um clone do workspace (só scope='workspace' e do próprio tenant). */
export async function updateCustomExpertAction(
  input: z.infer<typeof updateCloneSchema>,
): Promise<ActionResult> {
  const parsed = updateCloneSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message }

  const { supabase, workspaceId } = await ctx()
  const { id, name, role, description, tone, interruption, avatarUrl } = parsed.data

  const update: Record<string, unknown> = {
    name,
    tagline: role || 'Clone personalizado',
    bio: description.slice(0, 300),
    interruption,
    style_prompt: composeStylePrompt(role, description, tone, interruption),
    question_frameworks: { tone, interruption, description },
  }
  // undefined = mantém a foto atual; null = remove; string = troca
  if (avatarUrl !== undefined) update.avatar_url = avatarUrl

  const { error } = await supabase
    .from('sales_experts')
    .update(update)
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .eq('scope', 'workspace')
  if (error) return { error: error.message }

  revalidatePath('/app/experts')
  redirect('/app/experts')
}

/** Exclui um clone do workspace. Se era o clone ativo, limpa a seleção. */
export async function deleteCustomExpertAction(expertId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(expertId).success) return { error: 'id inválido' }

  const { supabase, workspaceId } = await ctx()

  const { error } = await supabase
    .from('sales_experts')
    .delete()
    .eq('id', expertId)
    .eq('workspace_id', workspaceId)
    .eq('scope', 'workspace')
  if (error) return { error: error.message }

  // se era o clone ativo do workspace, remove a referência órfã
  const { data: ws } = await supabase.from('workspaces').select('settings').eq('id', workspaceId).single()
  const settings = (ws?.settings ?? {}) as Record<string, unknown> & { default_expert_id?: string }
  if (settings.default_expert_id === expertId) {
    const { default_expert_id: _removed, ...rest } = settings
    await supabase.from('workspaces').update({ settings: rest }).eq('id', workspaceId)
    revalidatePath('/app')
  }

  revalidatePath('/app/experts')
  return {}
}
