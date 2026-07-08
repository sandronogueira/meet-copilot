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

const titleSchema = z.object({
  meetingId: z.uuid(),
  title: z.string().min(2, 'Dê um título à reunião').max(140),
})

export async function updateMeetingTitleAction(input: z.infer<typeof titleSchema>): Promise<ActionResult> {
  const parsed = titleSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message }

  const { supabase, workspaceId } = await ctx()
  const { error } = await supabase
    .from('meetings')
    .update({ title: parsed.data.title })
    .eq('id', parsed.data.meetingId)
    .eq('workspace_id', workspaceId)
  if (error) return { error: error.message }

  revalidatePath('/app')
  revalidatePath(`/app/meetings/${parsed.data.meetingId}/registro`)
  return {}
}

const summarySchema = z.object({
  meetingId: z.uuid(),
  summary: z.string().min(10, 'Resumo muito curto').max(8000),
})

export async function updateReportSummaryAction(
  input: z.infer<typeof summarySchema>,
): Promise<ActionResult> {
  const parsed = summarySchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message }

  const { supabase, workspaceId } = await ctx()
  const { error } = await supabase
    .from('reports')
    .update({ summary: parsed.data.summary })
    .eq('meeting_id', parsed.data.meetingId)
    .eq('workspace_id', workspaceId)
  if (error) return { error: error.message }

  revalidatePath(`/app/meetings/${parsed.data.meetingId}/registro`)
  return {}
}
