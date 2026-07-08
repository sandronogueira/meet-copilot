'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { supabaseServer } from '@/lib/supabase/server'

export interface ActionResult {
  error?: string
}

const profileSchema = z.object({
  fullName: z.string().min(2, 'Informe seu nome').max(80),
  selfLabel: z.string().max(40).optional(),
  workspaceName: z.string().min(2, 'Informe o nome da empresa/workspace').max(60),
})

/** Atualiza nome, rótulo da transcrição e nome do workspace num salvar só. */
export async function updateProfileAction(input: z.infer<typeof profileSchema>): Promise<ActionResult> {
  const parsed = profileSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message }

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

  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      full_name: parsed.data.fullName,
      self_label: parsed.data.selfLabel?.trim() || null,
    })
    .eq('user_id', user.id)
  if (profileError) return { error: profileError.message }

  const { error: wsError } = await supabase
    .from('workspaces')
    .update({ name: parsed.data.workspaceName })
    .eq('id', workspaceId)
  if (wsError) return { error: `Perfil salvo, mas o workspace não: ${wsError.message}` }

  revalidatePath('/app', 'layout')
  revalidatePath('/app/profile')
  return {}
}
