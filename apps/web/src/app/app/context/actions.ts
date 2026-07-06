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

// ── Bases ────────────────────────────────────────────────────────────────────

const createBaseSchema = z.object({
  name: z.string().min(2, 'Dê um nome à base').max(80),
  description: z.string().max(300).optional(),
})

export async function createBaseAction(input: z.infer<typeof createBaseSchema>): Promise<ActionResult> {
  const parsed = createBaseSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message }

  const { supabase, workspaceId } = await ctx()
  const { error } = await supabase.from('context_bases').insert({
    workspace_id: workspaceId,
    name: parsed.data.name,
    description: parsed.data.description || null,
  })
  if (error) return { error: error.message }

  revalidatePath('/app/context')
  return {}
}

// ── Documentos ───────────────────────────────────────────────────────────────

const addDocumentSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('url'),
    contextBaseId: z.uuid(),
    url: z.url('URL inválida — inclua https://'),
  }),
  z.object({
    kind: z.literal('text'),
    contextBaseId: z.uuid(),
    title: z.string().min(2, 'Dê um título ao documento').max(120),
    text: z.string().min(20, 'Conteúdo muito curto — capricha'),
  }),
])

export async function addDocumentAction(
  input: z.infer<typeof addDocumentSchema>,
): Promise<ActionResult> {
  const parsed = addDocumentSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message }

  const { supabase, workspaceId } = await ctx()

  // RLS garante o tenant; ainda assim, valida que a base é do workspace
  const { data: base } = await supabase
    .from('context_bases')
    .select('id')
    .eq('id', parsed.data.contextBaseId)
    .eq('workspace_id', workspaceId)
    .single()
  if (!base) return { error: 'Base não encontrada' }

  const doc: {
    workspace_id: string
    context_base_id: string
    source_type: string
    title: string
    source_url: string | null
    meta: Record<string, unknown>
  } =
    parsed.data.kind === 'url'
      ? {
          workspace_id: workspaceId,
          context_base_id: base.id as string,
          source_type: 'url',
          title: parsed.data.url.replace(/^https?:\/\//, '').slice(0, 120),
          source_url: parsed.data.url,
          meta: {},
        }
      : {
          workspace_id: workspaceId,
          context_base_id: base.id as string,
          source_type: 'text',
          title: parsed.data.title,
          source_url: null,
          meta: { raw_text: parsed.data.text },
        }

  const { error } = await supabase.from('documents').insert(doc)
  if (error) return { error: error.message }

  revalidatePath('/app/context')
  return {}
}

export async function deleteDocumentAction(documentId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(documentId).success) return { error: 'id inválido' }

  const { supabase, workspaceId } = await ctx()
  const { error } = await supabase
    .from('documents')
    .delete()
    .eq('id', documentId)
    .eq('workspace_id', workspaceId)
  if (error) return { error: error.message }

  revalidatePath('/app/context')
  return {}
}
