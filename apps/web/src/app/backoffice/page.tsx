import { requireSuperadmin } from '@/lib/superadmin'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { BackofficeView, type LlmKeyRow, type PlatformStats, type UserOverviewRow } from './backoffice-view'

export default async function BackofficePage() {
  await requireSuperadmin()

  const admin = supabaseAdmin()
  if (!admin) {
    return (
      <p className="text-error text-body-sm">
        Supabase admin indisponível: falta SUPABASE_SERVICE_ROLE_KEY no ambiente.
      </p>
    )
  }

  const [statsRes, overviewRes, keysRes] = await Promise.all([
    admin.rpc('backoffice_platform_stats').single(),
    admin.rpc('backoffice_overview'),
    // chaves de IA dos clientes: só metadados (o texto cifrado nunca sai do servidor).
    // Se a tabela ainda não existir, a coluna "IA" aparece vazia em vez de quebrar a página.
    admin.from('workspace_llm_keys').select('workspace_id, key_hint, source_workspace_id, status'),
  ])

  if (statsRes.error) {
    return <p className="text-error text-body-sm">Erro ao carregar estatísticas: {statsRes.error.message}</p>
  }
  if (overviewRes.error) {
    return <p className="text-error text-body-sm">Erro ao carregar usuários: {overviewRes.error.message}</p>
  }

  return (
    <BackofficeView
      stats={statsRes.data as PlatformStats}
      users={(overviewRes.data ?? []) as UserOverviewRow[]}
      llmKeys={(keysRes.data ?? []) as LlmKeyRow[]}
    />
  )
}
