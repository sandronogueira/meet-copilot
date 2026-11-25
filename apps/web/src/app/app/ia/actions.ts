'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { supabaseServer } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { encryptLlmKey, isAnthropicKeyFormat, llmKeyHint } from '@/lib/llm-key-crypto'
import { testAnthropicKey } from '@/lib/llm-keys'

export interface ActionResult {
  error?: string
}

type Admin = NonNullable<ReturnType<typeof supabaseAdmin>>

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

  return { user, workspaceId }
}

/**
 * Só dono ou admin do workspace mexe na chave de IA. Conferido com service_role
 * de propósito: a decisão não pode depender de uma policy de RLS estar certa.
 */
async function canManage(admin: Admin, workspaceId: string, userId: string): Promise<boolean> {
  const { data } = await admin
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle()
  return data?.role === 'owner' || data?.role === 'admin'
}

/** Trilha de auditoria. O conteúdo NUNCA inclui a chave, só os 4 últimos caracteres. */
async function audit(admin: Admin, entry: Record<string, unknown>): Promise<void> {
  const { error } = await admin.from('audit_logs').insert(entry)
  if (error) console.error('[ia] auditoria falhou:', error.message, '· action:', entry.action)
}

const saveSchema = z.object({
  apiKey: z.string().trim().min(20, 'Cole a chave completa').max(400, 'Isso não parece uma chave'),
})

/** Testa a chave na Anthropic e, se funcionar, guarda cifrada. */
export async function saveLlmKeyAction(input: z.infer<typeof saveSchema>): Promise<ActionResult> {
  const parsed = saveSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message }
  const apiKey = parsed.data.apiKey
  if (!isAnthropicKeyFormat(apiKey)) {
    return { error: 'Essa chave não tem o formato da Anthropic. Ela começa com "sk-ant-".' }
  }

  const { user, workspaceId } = await ctx()
  const admin = supabaseAdmin()
  const secret = process.env.ENGINE_WS_SECRET
  if (!admin || !secret || secret.length < 32) {
    return { error: 'Não é possível guardar chaves agora. Fale com o suporte.' }
  }
  if (!(await canManage(admin, workspaceId, user.id))) {
    return { error: 'Só o dono da conta pode trocar a chave de IA.' }
  }

  const { data: current } = await admin
    .from('workspace_llm_keys')
    .select('source_workspace_id')
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (current?.source_workspace_id) {
    return { error: 'Sua conta usa a IA da equipe. Fale com quem administra a equipe para trocar.' }
  }

  // Só guarda chave que funciona: o dono descobre o problema agora, não no meio de uma reunião.
  const test = await testAnthropicKey(apiKey)
  if (!test.ok) return { error: test.error }

  const hint = llmKeyHint(apiKey)
  const { error } = await admin.from('workspace_llm_keys').upsert(
    {
      workspace_id: workspaceId,
      provider: 'anthropic',
      key_ciphertext: encryptLlmKey(apiKey, workspaceId, secret),
      key_hint: hint,
      source_workspace_id: null,
      status: 'active',
      last_error: null,
      last_ok_at: new Date().toISOString(),
      created_by: user.id,
    },
    { onConflict: 'workspace_id' },
  )
  if (error) {
    console.error('[ia] gravação da chave falhou:', error.message)
    return { error: 'Não foi possível guardar a chave. Tente de novo.' }
  }

  await audit(admin, {
    workspace_id: workspaceId,
    actor_user_id: user.id,
    actor_type: 'user',
    action: 'llm_key.save',
    target_type: 'workspace',
    target_id: workspaceId,
    meta: { provider: 'anthropic', hint },
  })

  revalidatePath('/app/ia')
  return {}
}

/** Remove a chave própria. O copiloto volta a usar a IA da plataforma. */
export async function removeLlmKeyAction(): Promise<ActionResult> {
  const { user, workspaceId } = await ctx()
  const admin = supabaseAdmin()
  if (!admin) return { error: 'Não é possível alterar a chave agora. Fale com o suporte.' }
  if (!(await canManage(admin, workspaceId, user.id))) {
    return { error: 'Só o dono da conta pode remover a chave de IA.' }
  }

  // só a chave PRÓPRIA sai por aqui; vínculo com equipe é desfeito no backoffice
  const { error } = await admin
    .from('workspace_llm_keys')
    .delete()
    .eq('workspace_id', workspaceId)
    .is('source_workspace_id', null)
  if (error) {
    console.error('[ia] remoção da chave falhou:', error.message)
    return { error: 'Não foi possível remover a chave. Tente de novo.' }
  }

  await audit(admin, {
    workspace_id: workspaceId,
    actor_user_id: user.id,
    actor_type: 'user',
    action: 'llm_key.remove',
    target_type: 'workspace',
    target_id: workspaceId,
    meta: { provider: 'anthropic' },
  })

  revalidatePath('/app/ia')
  return {}
}
