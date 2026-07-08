'use server'

import crypto from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireSuperadmin } from '@/lib/superadmin'
import { supabaseAdmin } from '@/lib/supabase/admin'

export interface ActionResult {
  error?: string
}

export interface PasswordResult extends ActionResult {
  password?: string
}

/** Senha forte de 16 chars — nunca persiste em texto puro além do retorno único pra UI. */
function generatePassword(): string {
  return crypto.randomBytes(16).toString('base64url').slice(0, 16)
}

/** Busca o workspace do usuário-alvo pra anexar na auditoria (audit_logs exige workspace_id). */
async function targetWorkspaceId(
  admin: NonNullable<ReturnType<typeof supabaseAdmin>>,
  userId: string,
): Promise<string | null> {
  const { data } = await admin
    .from('profiles')
    .select('default_workspace_id')
    .eq('user_id', userId)
    .single()
  return (data?.default_workspace_id as string | null) ?? null
}

const createTesterSchema = z.object({
  fullName: z.string().min(2, 'Informe o nome').max(80),
  email: z.string().email('E-mail inválido'),
})

/** Cria tester direto (D1): e-mail pré-confirmado, sem SMTP. O trigger de signup provisiona o resto. */
export async function createTesterAction(
  input: z.infer<typeof createTesterSchema>,
): Promise<PasswordResult> {
  const { userId: actorUserId } = await requireSuperadmin()
  const parsed = createTesterSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message }

  const admin = supabaseAdmin()
  if (!admin) return { error: 'Supabase admin indisponível (env ausente).' }

  const password = generatePassword()
  const { data, error } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.fullName },
  })
  if (error) return { error: error.message }

  const newUserId = data.user?.id
  if (!newUserId) return { error: 'Usuário criado, mas sem ID retornado.' }

  const workspaceId = await targetWorkspaceId(admin, newUserId)
  if (workspaceId) {
    await admin.from('audit_logs').insert({
      workspace_id: workspaceId,
      actor_user_id: actorUserId,
      actor_type: 'user',
      action: 'backoffice.create_tester',
      target_type: 'user',
      target_id: newUserId,
      meta: { email: parsed.data.email, full_name: parsed.data.fullName },
    })
  }

  revalidatePath('/backoffice')
  return { password }
}

const banSchema = z.object({
  userId: z.string().uuid(),
  ban: z.boolean(),
})

/** Bloqueio/reativação = ban nativo do Supabase Auth (D4) — sem coluna nova, banido não loga. */
export async function setUserBanAction(input: z.infer<typeof banSchema>): Promise<ActionResult> {
  const { userId: actorUserId } = await requireSuperadmin()
  const parsed = banSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message }

  const admin = supabaseAdmin()
  if (!admin) return { error: 'Supabase admin indisponível (env ausente).' }

  const { error } = await admin.auth.admin.updateUserById(parsed.data.userId, {
    ban_duration: parsed.data.ban ? '87600h' : 'none',
  })
  if (error) return { error: error.message }

  const workspaceId = await targetWorkspaceId(admin, parsed.data.userId)
  if (workspaceId) {
    await admin.from('audit_logs').insert({
      workspace_id: workspaceId,
      actor_user_id: actorUserId,
      actor_type: 'user',
      action: parsed.data.ban ? 'backoffice.ban' : 'backoffice.unban',
      target_type: 'user',
      target_id: parsed.data.userId,
      meta: {},
    })
  }

  revalidatePath('/backoffice')
  return {}
}

const resetPasswordSchema = z.object({
  userId: z.string().uuid(),
})

/** Reset de senha do tester — nova senha exibida uma única vez na UI. */
export async function resetTesterPasswordAction(
  input: z.infer<typeof resetPasswordSchema>,
): Promise<PasswordResult> {
  const { userId: actorUserId } = await requireSuperadmin()
  const parsed = resetPasswordSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message }

  const admin = supabaseAdmin()
  if (!admin) return { error: 'Supabase admin indisponível (env ausente).' }

  const password = generatePassword()
  const { error } = await admin.auth.admin.updateUserById(parsed.data.userId, { password })
  if (error) return { error: error.message }

  const workspaceId = await targetWorkspaceId(admin, parsed.data.userId)
  if (workspaceId) {
    await admin.from('audit_logs').insert({
      workspace_id: workspaceId,
      actor_user_id: actorUserId,
      actor_type: 'user',
      action: 'backoffice.reset_password',
      target_type: 'user',
      target_id: parsed.data.userId,
      meta: {},
    })
  }

  revalidatePath('/backoffice')
  return { password }
}
