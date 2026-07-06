import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import { OnboardingWizard, type Expert } from './wizard'

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

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('onboarding_completed_at, onboarding_state')
    .eq('id', profile.default_workspace_id)
    .single()

  if (workspace?.onboarding_completed_at) redirect('/app')

  const { data: experts } = await supabase
    .from('sales_experts')
    .select('id, name, slug, tagline, sample_questions')
    .eq('status', 'active')
    .order('created_at')

  return (
    <OnboardingWizard
      experts={(experts ?? []) as Expert[]}
      initialFullName={profile.full_name ?? ''}
      initialSelfLabel={profile.self_label ?? ''}
      initialState={(workspace?.onboarding_state ?? {}) as Record<string, unknown>}
    />
  )
}
