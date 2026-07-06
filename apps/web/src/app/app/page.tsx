import { supabaseServer } from '@/lib/supabase/server'
import { MeetingLauncher } from './meeting-launcher'

export default async function DashboardPage() {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, default_workspace_id')
    .eq('user_id', user!.id)
    .single()

  const workspaceId = profile?.default_workspace_id as string

  const [{ data: workspace }, { data: meetings }, { data: bases }] = await Promise.all([
    supabase.from('workspaces').select('settings').eq('id', workspaceId).single(),
    supabase
      .from('meetings')
      .select('id, title, platform, status, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('context_bases')
      .select('id, name')
      .eq('workspace_id', workspaceId)
      .order('created_at'),
  ])

  const settings = (workspace?.settings ?? {}) as { default_expert_id?: string }
  const { data: expert } = settings.default_expert_id
    ? await supabase
        .from('sales_experts')
        .select('name, tagline')
        .eq('id', settings.default_expert_id)
        .single()
    : { data: null }

  const firstName = (profile?.full_name ?? 'você').split(' ')[0]

  return (
    <div>
      <p className="kicker">Painel</p>
      <h1 className="display" style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.6rem)', margin: '0.4rem 0 0.4rem' }}>
        Pronto para a próxima, {firstName}?
      </h1>
      {expert ? (
        <p className="muted" style={{ marginBottom: '2rem' }}>
          Copiloto ativo: <strong style={{ color: 'var(--accent)' }}>{expert.name}</strong> — {expert.tagline}
        </p>
      ) : null}

      <div className="panel" style={{ marginBottom: '2rem' }}>
        <p className="kicker" style={{ marginBottom: '0.8rem' }}>
          Nova reunião
        </p>
        <MeetingLauncher bases={bases ?? []} />
      </div>

      <p className="kicker" style={{ marginBottom: '0.8rem' }}>
        Reuniões recentes
      </p>
      {meetings && meetings.length > 0 ? (
        <div className="panel" style={{ padding: 0 }}>
          {meetings.map((m) => (
            <a
              key={m.id}
              href={`/app/meetings/${m.id}`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '0.9rem 1.4rem',
                borderBottom: '1px solid var(--line)',
                color: 'var(--fg)',
                textDecoration: 'none',
              }}
            >
              <span>{m.title ?? 'Reunião sem título'}</span>
              <span className="mono muted" style={{ fontSize: '0.75rem' }}>
                {m.platform ?? '—'} · {m.status}
              </span>
            </a>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          Nenhuma reunião ainda. Cole o link da sua próxima call ali em cima — o resto é com a gente.
        </div>
      )}
    </div>
  )
}
