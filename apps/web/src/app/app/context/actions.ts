'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { supabaseServer } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { extractTextFromFile } from '@/lib/extract-text'

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

const updateBaseSchema = z.object({
  id: z.uuid(),
  name: z.string().min(2, 'Dê um nome à base').max(80),
  description: z.string().max(300).optional(),
})

export async function updateBaseAction(input: z.infer<typeof updateBaseSchema>): Promise<ActionResult> {
  const parsed = updateBaseSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message }

  const { supabase, workspaceId } = await ctx()
  const { error } = await supabase
    .from('context_bases')
    .update({ name: parsed.data.name, description: parsed.data.description || null })
    .eq('id', parsed.data.id)
    .eq('workspace_id', workspaceId)
  if (error) return { error: error.message }

  revalidatePath('/app/context')
  return {}
}

/** Exclui a base e TODOS os seus documentos (cascade) + originais no Storage. */
export async function deleteBaseAction(baseId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(baseId).success) return { error: 'id inválido' }

  const { supabase, workspaceId } = await ctx()

  // originais no Storage (fail-soft: órfãos não bloqueiam a exclusão)
  const admin = supabaseAdmin()
  if (admin) {
    const prefix = `${workspaceId}/${baseId}`
    const { data: files } = await admin.storage.from('context-docs').list(prefix, { limit: 100 })
    if (files && files.length > 0) {
      await admin.storage.from('context-docs').remove(files.map((f) => `${prefix}/${f.name}`))
    }
  }

  const { error } = await supabase
    .from('context_bases')
    .delete()
    .eq('id', baseId)
    .eq('workspace_id', workspaceId)
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

const MAX_FILE_BYTES = 15 * 1024 * 1024

/**
 * Upload de arquivo (PDF, DOCX, XLSX, CSV, MD, TXT) para uma base.
 * O texto é extraído AQUI e salvo em meta.raw_text — pronto para o engine
 * usar como contexto imediatamente. O original vai para o Storage privado.
 */
export async function uploadFileDocumentAction(formData: FormData): Promise<ActionResult> {
  const contextBaseId = formData.get('contextBaseId')
  const file = formData.get('file')
  if (typeof contextBaseId !== 'string' || !z.uuid().safeParse(contextBaseId).success) {
    return { error: 'Base inválida' }
  }
  if (!(file instanceof File) || file.size === 0) return { error: 'Selecione um arquivo' }
  if (file.size > MAX_FILE_BYTES) return { error: 'Arquivo acima de 15MB' }

  const { supabase, workspaceId } = await ctx()

  const { data: base } = await supabase
    .from('context_bases')
    .select('id')
    .eq('id', contextBaseId)
    .eq('workspace_id', workspaceId)
    .single()
  if (!base) return { error: 'Base não encontrada' }

  const buf = Buffer.from(await file.arrayBuffer())
  const extracted = await extractTextFromFile(file.name, buf)
  if (!extracted.ok) return { error: extracted.error }

  // Original no Storage privado (fail-soft: sem service key, segue só com o texto)
  let storagePath: string | null = null
  const admin = supabaseAdmin()
  if (admin) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80)
    const path = `${workspaceId}/${contextBaseId}/${crypto.randomUUID()}-${safeName}`
    const { error: upErr } = await admin.storage.from('context-docs').upload(path, buf, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })
    if (upErr) console.error('[upload context-docs]', upErr.message)
    else storagePath = path
  }

  const { error } = await supabase.from('documents').insert({
    workspace_id: workspaceId,
    context_base_id: contextBaseId,
    source_type: 'file',
    title: file.name.slice(0, 120),
    storage_path: storagePath,
    status: 'ready',
    meta: { raw_text: extracted.text, original_bytes: file.size },
  })
  if (error) return { error: error.message }

  revalidatePath('/app/context')
  return {}
}

/** Edita título/conteúdo de um documento de texto livre. */
const updateTextDocSchema = z.object({
  id: z.uuid(),
  title: z.string().min(2, 'Dê um título ao documento').max(120),
  text: z.string().min(20, 'Conteúdo muito curto — capricha'),
})

export async function updateTextDocumentAction(
  input: z.infer<typeof updateTextDocSchema>,
): Promise<ActionResult> {
  const parsed = updateTextDocSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message }

  const { supabase, workspaceId } = await ctx()
  const { error } = await supabase
    .from('documents')
    .update({ title: parsed.data.title, meta: { raw_text: parsed.data.text } })
    .eq('id', parsed.data.id)
    .eq('workspace_id', workspaceId)
    .eq('source_type', 'text')
  if (error) return { error: error.message }

  revalidatePath('/app/context')
  return {}
}

export async function deleteDocumentAction(documentId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(documentId).success) return { error: 'id inválido' }

  const { supabase, workspaceId } = await ctx()

  // arquivo original no Storage sai junto (fail-soft)
  const { data: doc } = await supabase
    .from('documents')
    .select('storage_path')
    .eq('id', documentId)
    .eq('workspace_id', workspaceId)
    .single()
  if (doc?.storage_path) {
    const admin = supabaseAdmin()
    if (admin) await admin.storage.from('context-docs').remove([doc.storage_path as string])
  }

  const { error } = await supabase
    .from('documents')
    .delete()
    .eq('id', documentId)
    .eq('workspace_id', workspaceId)
  if (error) return { error: error.message }

  revalidatePath('/app/context')
  return {}
}
