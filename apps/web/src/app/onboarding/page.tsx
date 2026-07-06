import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import { OnboardingFlow, type FlowBase, type FlowExpert } from './onboarding-flow'

export const dynamic = 'force-dynamic'

export default async function OnboardingPage() {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, self_label, default_workspace_id')
    .eq('user_id', user.id)
    .single()
  if (!profile?.default_workspace_id) redirect('/login')
  const workspaceId = profile.default_workspace_id as string

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('onboarding_completed_at, settings')
    .eq('id', workspaceId)
    .single()
  if (workspace?.onboarding_completed_at) redirect('/app')

  const [{ data: bases }, { data: documents }, { data: experts }] = await Promise.all([
    supabase
      .from('context_bases')
      .select('id, name, is_default, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at'),
    supabase
      .from('documents')
      .select('id, context_base_id, source_type, title, status, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false }),
    supabase
      .from('sales_experts')
      .select('id, name, tagline, category, avatar_url, scope')
      .eq('status', 'active')
      .order('scope', { ascending: false })
      .order('created_at'),
  ])

  const basesWithDocs: FlowBase[] = (bases ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    is_default: b.is_default,
    documents: (documents ?? []).filter((d) => d.context_base_id === b.id),
  }))

  const settings = (workspace?.settings ?? {}) as { default_expert_id?: string }

  return (
    <OnboardingFlow
      fullName={profile.full_name ?? ''}
      selfLabel={profile.self_label ?? ''}
      bases={basesWithDocs}
      experts={(experts ?? []) as FlowExpert[]}
      selectedExpertId={settings.default_expert_id ?? null}
    />
  )
}
