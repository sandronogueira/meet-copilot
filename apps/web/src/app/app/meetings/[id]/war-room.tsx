'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'

interface SegmentEvent {
  speaker: string
  text: string
  isFinal: boolean
  seq: number | null
  ts: number
}

interface SuggestionEvent {
  id: string
  kind: 'question' | 'insight' | 'objection' | 'next_step' | 'risk'
  content: string
  rationale?: string
  ts: number
}

const KIND: Record<SuggestionEvent['kind'], { label: string; icon: string; tag: string }> = {
  question: { label: 'Pergunte agora', icon: 'quiz', tag: 'Pergunta' },
  insight: { label: 'Insight detectado', icon: 'lightbulb', tag: 'Insight' },
  objection: { label: 'Contorne a objeção', icon: 'shield', tag: 'Objeção' },
  next_step: { label: 'Próximo passo', icon: 'task_alt', tag: 'Ação' },
  risk: { label: 'Atenção', icon: 'warning', tag: 'Risco' },
}

interface ReportData {
  summary: string
  decisions: string[]
  actionItems: { descricao: string; responsavel: string | null; prazo: string | null }[]
  redFlags: string[]
  objections: string[]
  nextSteps: string[]
}

interface Props {
  meetingId: string
  title: string
  meetingCode?: string | null
  initialStatus: string
  baseName: string | null
  expertName: string | null
  variant?: 'session' | 'panel'
  /** URL http(s) do meeting-engine + token de controle (report/proposal) */
  engineUrl?: string | null
  controlToken?: string | null
}

function hhmm(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
function initial(name: string): string {
  return name.replace(/^(O|A)\s+/, '').charAt(0).toUpperCase() || '?'
}

export function WarRoom({
  meetingId,
  title,
  meetingCode,
  initialStatus,
  baseName,
  expertName,
  variant = 'session',
  engineUrl,
  controlToken,
}: Props) {
  const [finals, setFinals] = useState<SegmentEvent[]>([])
  const [partial, setPartial] = useState<SegmentEvent | null>(null)
  const [suggestions, setSuggestions] = useState<SuggestionEvent[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [connected, setConnected] = useState(false)
  const [ask, setAsk] = useState('')
  const [report, setReport] = useState<ReportData | null>(null)
  const [proposalUrl, setProposalUrl] = useState<string | null>(null)
  const [finalizing, setFinalizing] = useState<'report' | 'proposal' | null>(null)
  const [finalizeError, setFinalizeError] = useState<string | null>(null)
  const feedRef = useRef<HTMLDivElement>(null)

  const canFinalize = Boolean(engineUrl && controlToken)

  async function finalize(kind: 'report' | 'proposal') {
    if (!canFinalize || finalizing) return
    setFinalizing(kind)
    setFinalizeError(null)
    try {
      const res = await fetch(`${engineUrl}/${kind}?token=${encodeURIComponent(controlToken!)}`, {
        method: 'POST',
      })
      const json = (await res.json()) as {
        ok: boolean
        data?: ReportData & { url?: string }
        error?: { message: string }
      }
      if (!json.ok) {
        setFinalizeError(json.error?.message ?? `Falha ao gerar ${kind === 'report' ? 'relatório' : 'proposta'}`)
        return
      }
      if (kind === 'report') setReport(json.data as ReportData)
      else if (json.data?.url) setProposalUrl(json.data.url)
    } catch (e) {
      setFinalizeError(String(e))
    } finally {
      setFinalizing(null)
    }
  }

  useEffect(() => {
    const supabase = supabaseBrowser()
    const channel = supabase
      .channel(`meeting:${meetingId}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'segment' }, ({ payload }) => {
        const seg = payload as SegmentEvent
        if (seg.isFinal) {
          setPartial(null)
          setFinals((prev) => [...prev.slice(-200), seg])
        } else setPartial(seg)
      })
      .on('broadcast', { event: 'suggestion' }, ({ payload }) => {
        const s = payload as SuggestionEvent
        setSuggestions((prev) => (prev.some((p) => p.id === s.id) ? prev : [...prev.slice(-40), s]))
      })
      .on('broadcast', { event: 'report' }, ({ payload }) => {
        setReport(payload as ReportData)
      })
      .on('broadcast', { event: 'proposal' }, ({ payload }) => {
        const p = payload as { url?: string }
        if (p.url) setProposalUrl(p.url)
      })
      .subscribe((status) => setConnected(status === 'SUBSCRIBED'))
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [meetingId])

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' })
  }, [finals, partial])

  const visibleSuggestions = useMemo(
    () => suggestions.filter((s) => !dismissed.has(s.id)).reverse(),
    [suggestions, dismissed],
  )

  const panel = (
    <aside
      className={`relative flex flex-col bg-surface-container-lowest border-l border-white/10 ${
        variant === 'panel' ? 'w-full' : 'w-full lg:w-[400px] shrink-0'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
        <span className="material-symbols-outlined text-primary-fixed">psychiatry</span>
        <h2 className="font-headline-lg text-lg text-primary flex-1">Meet Copilot</h2>
        <span className={`w-2 h-2 rounded-full ${connected ? 'bg-primary-fixed shadow-[0_0_8px_#00fbfb]' : 'bg-outline'}`} />
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Live Transcription */}
        <div className="px-4 pt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase">Transcrição ao vivo</h3>
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-error">
              <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse" /> Gravando
            </span>
          </div>
          <div ref={feedRef} className="space-y-3 max-h-[38vh] overflow-y-auto pr-1">
            {finals.length === 0 && !partial && (
              <p className="text-on-surface-variant text-body-sm">Aguardando alguém falar na reunião…</p>
            )}
            {finals.map((seg, i) => (
              <TranscriptLine key={seg.seq ?? `f${i}`} seg={seg} />
            ))}
            {partial && <TranscriptLine seg={partial} muted />}
            {(finals.length > 0 || partial) && (
              <div className="flex items-center gap-2 text-on-surface-variant text-body-sm pt-1">
                <span className="material-symbols-outlined text-[18px] text-primary-fixed animate-pulse">graphic_eq</span>
                Escutando…
              </div>
            )}
          </div>
        </div>

        {/* AI Insights & Actions */}
        <div className="px-4 pt-6 pb-4">
          <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-3">
            Insights & Ações {expertName ? `· ${expertName}` : ''}
          </h3>
          {visibleSuggestions.length === 0 ? (
            <p className="text-on-surface-variant text-body-sm">
              O {expertName ?? 'copiloto'} vai destacar dores, objeções e próximos passos aqui
              {baseName ? `, com base em "${baseName}"` : ''} conforme a conversa avança.
            </p>
          ) : (
            <div className="space-y-3">
              {visibleSuggestions.map((s) => (
                <InsightCard
                  key={s.id}
                  sug={s}
                  onDismiss={() => setDismissed((prev) => new Set(prev).add(s.id))}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Finalização + Ask */}
      <div className="border-t border-white/10 p-3 space-y-2">
        {finalizeError ? <p className="text-error text-[12px]">{finalizeError}</p> : null}
        {proposalUrl ? (
          <a
            href={proposalUrl}
            target="_blank"
            rel="noreferrer"
            className="block text-primary-fixed text-[13px] underline underline-offset-4"
          >
            Proposta pronta — clique para abrir
          </a>
        ) : null}
        <div className="flex gap-2">
          <button
            onClick={() => finalize('report')}
            disabled={!canFinalize || finalizing !== null}
            title={canFinalize ? 'Gera o relatório da reunião até aqui' : 'Reinicie o copiloto para habilitar'}
            className="flex-1 px-3 py-2 rounded-md border border-outline-variant text-on-surface text-[13px] font-medium hover:border-primary-fixed hover:text-primary-fixed transition-colors disabled:opacity-40"
          >
            {finalizing === 'report' ? 'Gerando…' : 'Finalizar com Relatório'}
          </button>
          <button
            onClick={() => finalize('proposal')}
            disabled={!canFinalize || finalizing !== null}
            title={canFinalize ? 'Gera a proposta comercial desta reunião' : 'Reinicie o copiloto para habilitar'}
            className="flex-1 px-3 py-2 rounded-md bg-primary-fixed text-on-primary-fixed text-[13px] font-bold hover:shadow-[0_0_15px_rgba(0,251,251,0.4)] transition-all disabled:opacity-40"
          >
            {finalizing === 'proposal' ? 'Gerando…' : 'Gerar Proposta'}
          </button>
        </div>
        <div className="flex items-center gap-2 bg-surface-container-high border border-white/10 rounded-full px-4 py-2">
          <input
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            placeholder="Pergunte algo ao Copilot…"
            className="flex-1 bg-transparent text-primary placeholder-on-surface-variant focus:outline-none text-body-sm"
            disabled
            title="Em breve"
          />
          <button className="material-symbols-outlined text-on-surface-variant" disabled>
            send
          </button>
        </div>
        <p className="text-center text-[11px] text-on-surface-variant opacity-70">
          A IA pode cometer erros. Confira as respostas.
        </p>
      </div>

      {/* Overlay: relatório de finalização */}
      {report ? <ReportOverlay report={report} onClose={() => setReport(null)} onProposal={() => finalize('proposal')} proposalUrl={proposalUrl} finalizing={finalizing !== null} /> : null}
    </aside>
  )

  if (variant === 'panel') return <div className="h-[100dvh]">{panel}</div>

  // variant 'session' — palco da reunião à esquerda + painel à direita
  const speakers = Array.from(new Set(finals.map((f) => f.speaker))).slice(0, 4)
  return (
    <div className="fixed inset-0 z-[60] flex bg-black">
      <MeetingStage title={title} code={meetingCode ?? null} status={initialStatus} speakers={speakers} />
      {panel}
    </div>
  )
}

function ReportOverlay({
  report,
  onClose,
  onProposal,
  proposalUrl,
  finalizing,
}: {
  report: ReportData
  onClose: () => void
  onProposal: () => void
  proposalUrl: string | null
  finalizing: boolean
}) {
  const section = (title: string, items: string[]) =>
    items.length > 0 ? (
      <div>
        <h4 className="font-label-caps text-label-caps text-primary-fixed uppercase mb-2">{title}</h4>
        <ul className="space-y-1.5">
          {items.map((item, i) => (
            <li key={i} className="text-body-sm text-on-surface flex gap-2">
              <span className="text-primary-fixed shrink-0">›</span> {item}
            </li>
          ))}
        </ul>
      </div>
    ) : null

  return (
    <div className="absolute inset-0 z-20 bg-surface-container-lowest/95 backdrop-blur-sm overflow-y-auto">
      <div className="p-5 space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-label-caps text-label-caps text-primary-fixed uppercase">Relatório da reunião</p>
            <h3 className="font-headline-lg text-xl text-primary mt-1">Resumo executivo</h3>
          </div>
          <button onClick={onClose} className="material-symbols-outlined text-on-surface-variant hover:text-primary">
            close
          </button>
        </div>

        <p className="text-body-sm text-on-surface leading-relaxed">{report.summary}</p>

        {section('Decisões', report.decisions)}

        {report.actionItems.length > 0 ? (
          <div>
            <h4 className="font-label-caps text-label-caps text-primary-fixed uppercase mb-2">Ações</h4>
            <ul className="space-y-2">
              {report.actionItems.map((a, i) => (
                <li key={i} className="text-body-sm text-on-surface bg-[#111214] border border-outline-variant rounded-lg px-3 py-2">
                  {a.descricao}
                  <span className="block text-[11px] text-on-surface-variant mt-0.5">
                    {a.responsavel ? `Responsável: ${a.responsavel}` : ''} {a.prazo ? `· Prazo: ${a.prazo}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {section('Red flags', report.redFlags)}
        {section('Objeções', report.objections)}
        {section('Próximos passos', report.nextSteps)}

        <div className="pt-2 pb-6 space-y-2">
          {proposalUrl ? (
            <a
              href={proposalUrl}
              target="_blank"
              rel="noreferrer"
              className="block w-full text-center px-3 py-2.5 rounded-md bg-primary-fixed text-on-primary-fixed text-[13px] font-bold"
            >
              Abrir Proposta Comercial
            </a>
          ) : (
            <button
              onClick={onProposal}
              disabled={finalizing}
              className="w-full px-3 py-2.5 rounded-md bg-primary-fixed text-on-primary-fixed text-[13px] font-bold hover:shadow-[0_0_15px_rgba(0,251,251,0.4)] transition-all disabled:opacity-40"
            >
              {finalizing ? 'Gerando proposta…' : 'Gerar Proposta Comercial'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function TranscriptLine({ seg, muted }: { seg: SegmentEvent; muted?: boolean }) {
  return (
    <div className={`flex gap-2.5 ${muted ? 'opacity-60' : ''}`}>
      <div className="w-7 h-7 rounded-full bg-surface-container-high border border-white/10 grid place-items-center text-[11px] font-bold text-primary-fixed shrink-0">
        {initial(seg.speaker)}
      </div>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-primary truncate">{seg.speaker}</span>
          <span className="text-[10px] text-on-surface-variant font-mono">{hhmm(seg.ts)}</span>
        </div>
        <p className={`text-body-sm ${muted ? 'italic text-on-surface-variant' : 'text-on-surface'}`}>{seg.text}</p>
      </div>
    </div>
  )
}

function InsightCard({ sug, onDismiss }: { sug: SuggestionEvent; onDismiss: () => void }) {
  const meta = KIND[sug.kind]
  return (
    <div className="bg-[#111214] border border-outline-variant rounded-xl p-4 relative">
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined text-primary-fixed text-[22px] shrink-0">{meta.icon}</span>
        <div className="min-w-0 flex-1">
          <h4 className="font-headline-lg text-[15px] text-primary mb-1">{meta.label}</h4>
          <p className="text-body-sm text-on-surface leading-relaxed">{sug.content}</p>
          {sug.rationale && <p className="text-[12px] text-on-surface-variant italic mt-1.5">{sug.rationale}</p>}
          <div className="flex items-center gap-2 mt-3">
            <span className="px-2 py-0.5 rounded border border-primary-fixed/30 bg-primary-fixed/10 text-primary-fixed font-label-caps text-[10px]">
              {meta.tag}
            </span>
            <button
              onClick={onDismiss}
              className="ml-auto text-[11px] text-on-surface-variant hover:text-primary-fixed transition-colors"
            >
              Dispensar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function MeetingStage({
  title,
  code,
  status,
  speakers,
}: {
  title: string
  code: string | null
  status: string
  speakers: string[]
}) {
  const tiles = speakers.length > 0 ? speakers : ['Você']
  return (
    <main className="hidden lg:flex flex-1 relative flex-col bg-[#0b0d0e]">
      {/* overlays */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2 text-on-surface-variant text-body-sm font-mono">
        <span className="w-2 h-2 rounded-full bg-error animate-pulse" />
        {code ? `${code}` : title}
        <span className="text-outline">· {status}</span>
      </div>
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2 bg-surface-container-high/80 backdrop-blur border border-white/10 rounded-full px-3 py-1.5 text-body-sm text-on-surface">
        <span className="material-symbols-outlined text-[16px] text-primary-fixed">auto_awesome</span>
        Meet Copilot ativo
      </div>

      {/* participant tiles */}
      <div className="flex-1 grid place-items-center p-8">
        <div className={`grid gap-4 w-full max-w-3xl ${tiles.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {tiles.map((name) => (
            <div
              key={name}
              className="aspect-video rounded-xl bg-gradient-to-br from-surface-container-high to-surface-container-low border border-white/10 grid place-items-center relative overflow-hidden"
            >
              <div className="w-20 h-20 rounded-full bg-primary-fixed/10 border border-primary-fixed/30 grid place-items-center font-display-lg text-3xl font-bold text-primary-fixed">
                {initial(name)}
              </div>
              <span className="absolute bottom-3 left-3 text-body-sm text-primary bg-black/40 rounded px-2 py-0.5">{name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* control bar (representa o Meet — controles reais ficam na aba do Meet) */}
      <div className="pb-6 flex items-center justify-center gap-3">
        {['mic', 'videocam', 'present_to_all', 'more_vert'].map((ic) => (
          <span key={ic} className="w-11 h-11 rounded-full bg-surface-container-high border border-white/10 grid place-items-center text-on-surface-variant material-symbols-outlined">
            {ic}
          </span>
        ))}
        <span className="w-11 h-11 rounded-full bg-error grid place-items-center text-on-error material-symbols-outlined">call_end</span>
      </div>
      <p className="text-center text-[11px] text-outline pb-3">Sua reunião acontece no Google Meet — este é o painel do copiloto ao lado.</p>
    </main>
  )
}
