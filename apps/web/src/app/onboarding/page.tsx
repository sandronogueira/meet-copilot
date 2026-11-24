import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import { OnboardingFlow, type FlowBase, type FlowExpert } from './onboarding-flow'
import { ONBOARDING_SITE_TITLE, buildSavedProfile, resolveInitialStep } from './progress'

export const dynamic = 'force-dynamic'
// As actions desta página leem o site da empresa (até ~10s de rede de terceiros).
export const maxDuration = 30

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
    .select('onboarding_completed_at, settings, onboarding_state')
    .eq('id', workspaceId)
    .single()
  if (workspace?.onboarding_completed_at) redirect('/app')

  const [{ data: bases }, { data: documents }, { data: experts }, { data: profileDoc }] = await Promise.all([
    supabase
      .from('context_bases')
      .select('id, name, is_default, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at'),
    supabase
      .from('documents')
      .select('id, context_base_id, source_type, title, source_url, status, error_detail, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false }),
    supabase
      .from('sales_experts')
      .select('id, name, tagline, category, avatar_url, scope')
      .eq('status', 'active')
      .order('scope', { ascending: false })
      .order('created_at'),
    // descrição/segmento do Perfil moram no documento onboarding_profile —
    // buscado à parte para não mandar o texto de TODOS os documentos ao cliente
    supabase
      .from('documents')
      .select('meta')
      .eq('workspace_id', workspaceId)
      .eq('source_type', 'onboarding_profile')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const basesWithDocs: FlowBase[] = (bases ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    is_default: b.is_default,
    documents: (documents ?? []).filter((d) => d.context_base_id === b.id),
  }))

  const settings = (workspace?.settings ?? {}) as { default_expert_id?: string; sales_profile?: unknown }

  // Retomada: o que já foi salvo volta preenchido e o wizard abre na etapa em
  // que o usuário estava (documents vem do mais novo para o mais antigo).
  const siteDoc = (documents ?? []).find((d) => d.source_type === 'url' && d.title === ONBOARDING_SITE_TITLE)
  const savedProfile = buildSavedProfile({
    salesProfile: settings.sales_profile,
    profileDocMeta: profileDoc?.meta,
    siteUrl: siteDoc?.source_url as string | null | undefined,
  })

  return (
    <OnboardingFlow
      fullName={profile.full_name ?? ''}
      selfLabel={profile.self_label ?? ''}
      bases={basesWithDocs}
      experts={(experts ?? []) as FlowExpert[]}
      selectedExpertId={settings.default_expert_id ?? null}
      initialStep={resolveInitialStep(workspace?.onboarding_state)}
      savedProfile={savedProfile}
    />
  )
}
