import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import { ExpertsGallery, type ExpertCard } from './experts-gallery'

export default async function ExpertsPage() {
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
  const workspaceId = profile?.default_workspace_id as string

  const [{ data: experts }, { data: workspace }] = await Promise.all([
    supabase
      .from('sales_experts')
      .select('id, name, tagline, category, avatar_url, sample_questions, scope')
      .eq('status', 'active')
      .order('scope', { ascending: false }) // global antes de workspace
      .order('created_at'),
    supabase.from('workspaces').select('settings').eq('id', workspaceId).single(),
  ])

  const settings = (workspace?.settings ?? {}) as { default_expert_id?: string }

  return (
    <ExpertsGallery
      experts={(experts ?? []) as ExpertCard[]}
      selectedId={settings.default_expert_id ?? null}
    />
  )
}
