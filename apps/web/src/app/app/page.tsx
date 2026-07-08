import { supabaseServer } from '@/lib/supabase/server'
import { MeetingLauncher } from './meeting-launcher'

interface MeetingOverview {
  id: string
  title: string | null
  status: string
  created_at: string
  duration_ms: number
  has_report: boolean
  has_proposal: boolean
  proposal_slug: string | null
}

function fmtDuration(ms: number): string | null {
  const min = Math.round(ms / 60000)
  if (min < 1) return null
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const rest = min % 60
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`
}

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
    supabase.rpc('list_meetings_overview', { p_workspace: workspaceId, p_limit: 20 }),
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
  const rows = (meetings ?? []) as MeetingOverview[]

  return (
    <div>
      <p className="kicker">Reuniões</p>
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
        Suas reuniões
      </p>
      {rows.length > 0 ? (
        <div className="panel" style={{ padding: 0 }}>
          {rows.map((m) => {
            const duration = fmtDuration(m.duration_ms)
            const live = m.status === 'in_call'
            return (
              <a
                key={m.id}
                href={`/app/meetings/${m.id}/registro`}
                title="Abrir o registro da sessão (transcrição, relatório, proposta)"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '1rem',
                  padding: '1rem 1.4rem',
                  borderBottom: '1px solid var(--line)',
                  color: 'var(--fg)',
                  textDecoration: 'none',
                }}
              >
                <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <span
                    style={{
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {m.title ?? 'Reunião sem título'}
                  </span>
                  <span style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
                    {live ? <Tag variant="live">ao vivo</Tag> : null}
                    {duration ? <Tag variant="neutral">{duration}</Tag> : null}
                    {m.has_proposal ? <Tag variant="accent">Proposta comercial</Tag> : null}
                    {m.has_report ? <Tag variant="soft">Resumo</Tag> : null}
                  </span>
                </div>
                <span className="mono muted" style={{ fontSize: '0.75rem', flexShrink: 0 }}>
                  {new Date(m.created_at).toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </a>
            )
          })}
        </div>
      ) : (
        <div className="empty-state">
          Nenhuma reunião ainda. Cole o link da sua próxima call ali em cima — o resto é com a gente.
        </div>
      )}
    </div>
  )
}

function Tag({
  children,
  variant,
}: {
  children: React.ReactNode
  variant: 'accent' | 'soft' | 'neutral' | 'live'
}) {
  const styles: Record<typeof variant, React.CSSProperties> = {
    // proposta: cor da marca, cheia — é o entregável mais valioso
    accent: { background: 'var(--accent)', color: '#032a33', border: '1px solid var(--accent)' },
    // resumo/relatório: contorno na cor da marca
    soft: { background: 'rgba(45,225,253,0.10)', color: 'var(--accent)', border: '1px solid rgba(45,225,253,0.35)' },
    // duração: neutro
    neutral: { background: 'transparent', color: 'var(--fg-dim)', border: '1px solid var(--line)' },
    // ao vivo: vermelho
    live: { background: 'rgba(255,90,90,0.12)', color: '#ff7a7a', border: '1px solid rgba(255,90,90,0.4)' },
  }
  return (
    <span
      style={{
        ...styles[variant],
        fontSize: '0.68rem',
        fontWeight: 600,
        letterSpacing: '0.02em',
        padding: '0.15rem 0.55rem',
        borderRadius: '999px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.3rem',
        whiteSpace: 'nowrap',
      }}
    >
      {variant === 'live' ? (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#ff5a5a',
            display: 'inline-block',
          }}
        />
      ) : null}
      {children}
    </span>
  )
}
