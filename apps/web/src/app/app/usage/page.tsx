import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// D1: 1 crédito = 1 minuto de reunião transcrita.
// D2: limite lido de subscriptions.limits->>'credits_month', com fallback no código
//     (nenhum workspace tem linha em subscriptions ainda — todo mundo cai no fallback).
const TZ = 'America/Fortaleza'
const FALLBACK_CREDITS_MONTH = 300

interface MeetingOverviewRow {
  id: string
  created_at: string
  duration_ms: number
}

interface SuggestionTokensRow {
  tokens_in: number | null
  tokens_out: number | null
}

/**
 * Início/fim (exclusivo) do mês corrente na timezone informada, como instantes UTC.
 * Evita hardcode de offset: lê o "relógio de parede" da timezone via Intl e reconstrói
 * o instante UTC a partir da diferença entre a leitura e o agora real.
 */
function currentMonthBoundsUtc(tz: string): { start: Date; end: Date } {
  const now = new Date()
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const parts = Object.fromEntries(
    fmt.formatToParts(now).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]),
  ) as Record<string, string>

  const year = Number(parts.year)
  const month = Number(parts.month) // 1-12

  // "agora" lido como se já fosse UTC — a diferença pro instante real é o offset da tz
  const nowReadAsUtc = Date.UTC(
    year,
    month - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  )
  const offsetMs = nowReadAsUtc - now.getTime()

  const startLocalReadAsUtc = Date.UTC(year, month - 1, 1, 0, 0, 0)
  const nextMonth = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 }
  const endLocalReadAsUtc = Date.UTC(nextMonth.y, nextMonth.m - 1, 1, 0, 0, 0)

  return {
    start: new Date(startLocalReadAsUtc - offsetMs),
    end: new Date(endLocalReadAsUtc - offsetMs),
  }
}

const numberFmt = new Intl.NumberFormat('pt-BR')

export default async function UsagePage() {
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

  const { start, end } = currentMonthBoundsUtc(TZ)

  // D3: consumo calculado com a RPC já existente (workspace-scoped via is_member),
  // somado aqui no server. Tokens: query direta em suggestions — RLS (sg_select) já
  // garante isolamento por workspace.
  const [{ data: meetingsRaw }, { data: subscription }, { data: suggestionsRaw }] = await Promise.all([
    supabase.rpc('list_meetings_overview', { p_workspace: workspaceId, p_limit: 200 }),
    supabase.from('subscriptions').select('limits').eq('workspace_id', workspaceId).maybeSingle(),
    supabase
      .from('suggestions')
      .select('tokens_in, tokens_out')
      .eq('workspace_id', workspaceId)
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString()),
  ])

  const meetings = (meetingsRaw ?? []) as MeetingOverviewRow[]
  const meetingsThisMonth = meetings.filter((m) => {
    const createdAt = new Date(m.created_at)
    return createdAt >= start && createdAt < end
  })

  const totalMs = meetingsThisMonth.reduce((sum, m) => sum + (m.duration_ms ?? 0), 0)
  const creditsUsed = Math.round(totalMs / 60000)
  const meetingsCount = meetingsThisMonth.length

  const suggestionsRows = (suggestionsRaw ?? []) as SuggestionTokensRow[]
  const suggestionsCount = suggestionsRows.length
  const tokensTotal = suggestionsRows.reduce(
    (sum, s) => sum + (s.tokens_in ?? 0) + (s.tokens_out ?? 0),
    0,
  )

  const limits = (subscription?.limits ?? {}) as { credits_month?: number | string }
  const limitRaw = Number(limits.credits_month)
  const creditsLimit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : FALLBACK_CREDITS_MONTH

  const percent = creditsLimit > 0 ? (creditsUsed / creditsLimit) * 100 : 0
  const barWidth = Math.min(100, Math.max(0, percent))
  // ciano até 80%, âmbar até 100%, vermelho acima — sem enforcement (D5), só sinalização
  const barColor = percent > 100 ? '#ffb4ab' : percent > 80 ? '#ffd166' : '#00fbfb'

  return (
    <div className="max-w-[860px] mx-auto">
      <header className="mb-8">
        <p className="font-label-caps text-label-caps text-primary-fixed tracking-widest mb-3">CONSUMO</p>
        <h1 className="font-display-lg text-3xl text-primary mb-2">Seu consumo neste mês</h1>
        <p className="text-on-surface-variant text-body-sm leading-relaxed">
          1 crédito = 1 minuto de reunião. Seu plano de teste inclui{' '}
          {numberFmt.format(creditsLimit)} créditos/mês.
        </p>
      </header>

      <div className="bg-[#111214] border border-white/10 rounded-xl p-6 md:p-8 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
            Créditos usados
          </span>
          <span className="text-sm text-primary font-mono">
            {numberFmt.format(creditsUsed)} / {numberFmt.format(creditsLimit)}
          </span>
        </div>
        <div className="w-full h-3 bg-surface-container-high rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${barWidth}%`, backgroundColor: barColor }}
          />
        </div>
        {percent > 100 ? (
          <p className="text-error text-[12px] mt-2">
            Limite do mês estourado — sem bloqueio nesta fase de teste.
          </p>
        ) : percent > 80 ? (
          <p className="text-[12px] mt-2" style={{ color: '#ffd166' }}>
            Perto do limite do mês.
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Reuniões no mês" value={numberFmt.format(meetingsCount)} />
        <StatCard label="Minutos" value={numberFmt.format(creditsUsed)} />
        <StatCard label="Sugestões geradas" value={numberFmt.format(suggestionsCount)} />
        <StatCard label="Tokens" value={numberFmt.format(tokensTotal)} />
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#111214] border border-white/10 rounded-xl p-4">
      <p className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-1">{label}</p>
      <p className="font-display-lg text-2xl text-primary-fixed">{value}</p>
    </div>
  )
}
