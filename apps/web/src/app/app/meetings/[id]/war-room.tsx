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

interface ExpertOption {
  id: string
  name: string
  tagline: string | null
  category: string | null
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
  const [activeExpert, setActiveExpert] = useState<{ id: string | null; name: string | null }>({
    id: null,
    name: expertName,
  })
  const [pickerOpen, setPickerOpen] = useState(false)
  const [experts, setExperts] = useState<ExpertOption[] | null>(null)
  const [expertBusy, setExpertBusy] = useState(false)
  const [expertError, setExpertError] = useState<string | null>(null)
  // Modo discreto: esconde transcrição/insights ao compartilhar a tela —
  // o cliente não vê que uma IA está soprando as perguntas.
  const [discreet, setDiscreet] = useState(false)
  const feedRef = useRef<HTMLDivElement>(null)

  const canFinalize = Boolean(engineUrl && controlToken)

  function togglePicker() {
    const opening = !pickerOpen
    setPickerOpen(opening)
    setExpertError(null)
    if (opening && experts === null && canFinalize) {
      void fetch(`${engineUrl}/experts?token=${encodeURIComponent(controlToken!)}`)
        .then((r) => r.json())
        .then((json: { ok: boolean; data?: { experts: ExpertOption[]; activeId: string | null } }) => {
          if (!json.ok || !json.data) {
            setExpertError('Não deu para carregar os clones. Tente de novo.')
            return
          }
          setExperts(json.data.experts)
          const activeId = json.data.activeId
          if (activeId) {
            const found = json.data.experts.find((e) => e.id === activeId)
            setActiveExpert((prev) => ({ id: activeId, name: found?.name ?? prev.name }))
          }
        })
        .catch(() => setExpertError('Não deu para carregar os clones. Tente de novo.'))
    }
  }

  async function selectExpert(expert: ExpertOption) {
    if (!canFinalize || expertBusy) return
    if (expert.id === activeExpert.id) {
      setPickerOpen(false)
      return
    }
    setExpertBusy(true)
    setExpertError(null)
    try {
      const res = await fetch(
        `${engineUrl}/expert?token=${encodeURIComponent(controlToken!)}&expertId=${encodeURIComponent(expert.id)}`,
        { method: 'POST' },
      )
      const json = (await res.json()) as { ok: boolean; error?: { message: string } }
      if (!json.ok) {
        setExpertError(json.error?.message ?? 'Falha ao trocar o clone')
        return
      }
      setActiveExpert({ id: expert.id, name: expert.name })
      setPickerOpen(false)
    } catch (e) {
      setExpertError(String(e))
    } finally {
      setExpertBusy(false)
    }
  }

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
      .on('broadcast', { event: 'expert' }, ({ payload }) => {
        const p = payload as { id?: string; name?: string }
        if (p.name) setActiveExpert({ id: p.id ?? null, name: p.name })
      })
      .subscribe((status) => setConnected(status === 'SUBSCRIBED'))
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [meetingId])

  // Feed único estilo Claude extension: fala e insights intercalados na ordem
  // em que acontecem, num scroll só. O rodapé (ações + pergunta) fica fixo.
  const feed = useMemo(() => {
    const items: Array<
      | { kind: 'seg'; ts: number; key: string; seg: SegmentEvent }
      | { kind: 'sug'; ts: number; key: string; sug: SuggestionEvent }
    > = [
      ...finals.map((s, i) => ({ kind: 'seg' as const, ts: s.ts, key: `s${s.seq ?? i}-${s.ts}`, seg: s })),
      ...suggestions
        .filter((s) => !dismissed.has(s.id))
        .map((s) => ({ kind: 'sug' as const, ts: s.ts, key: s.id, sug: s })),
    ]
    return items.sort((a, b) => a.ts - b.ts)
  }, [finals, suggestions, dismissed])

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' })
  }, [feed, partial])

  // MODO DISCRETO: nada de transcrição, insights ou botões de IA na tela —
  // visual neutro de "anotações" enquanto a captura segue rodando por trás.
  if (discreet) {
    const neutral = (
      <aside
        className={`relative flex h-full flex-col bg-surface-container-lowest border-l border-white/10 ${
          variant === 'panel' ? 'w-full' : 'w-full lg:w-[400px] shrink-0'
        }`}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 shrink-0">
          <span className="material-symbols-outlined text-on-surface-variant text-[20px]">edit_note</span>
          <h2 className="text-[15px] font-medium text-on-surface-variant flex-1">Anotações</h2>
          <button
            onClick={() => setDiscreet(false)}
            title="Mostrar o painel do copiloto"
            className="material-symbols-outlined text-[20px] text-on-surface-variant/50 hover:text-primary-fixed transition-colors"
          >
            visibility
          </button>
        </div>
        <div className="flex-1" />
      </aside>
    )
    if (variant === 'panel') return <div className="h-[100dvh]">{neutral}</div>
    return (
      <div className="fixed inset-0 z-[60] flex bg-black">
        <main className="hidden lg:flex flex-1 bg-[#0b0d0e]" />
        {neutral}
      </div>
    )
  }

  const panel = (
    <aside
      className={`relative flex h-full flex-col bg-surface-container-lowest border-l border-white/10 ${
        variant === 'panel' ? 'w-full' : 'w-full lg:w-[400px] shrink-0'
      }`}
    >
      {/* Header fixo */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 shrink-0">
        <span className="material-symbols-outlined text-primary-fixed">psychiatry</span>
        <h2 className="font-headline-lg text-lg text-primary flex-1 min-w-0 flex items-center gap-2">
          <span className="shrink-0">Meet Copilot</span>
          {canFinalize ? (
            <button
              onClick={togglePicker}
              title="Trocar o clone que está escutando a conversa"
              className="flex items-center gap-0.5 min-w-0 text-[12px] font-normal text-on-surface-variant hover:text-primary-fixed transition-colors"
            >
              <span className="truncate">{activeExpert.name ?? 'Escolher clone'}</span>
              <span className="material-symbols-outlined text-[16px] shrink-0">expand_more</span>
            </button>
          ) : activeExpert.name ? (
            <span className="text-on-surface-variant text-[12px] font-normal truncate">· {activeExpert.name}</span>
          ) : null}
        </h2>
        <button
          onClick={() => {
            setDiscreet(true)
            setPickerOpen(false)
          }}
          title="Modo discreto — esconde transcrição e insights ao compartilhar a tela (a captura continua). Para liberar o espaço todo, feche o painel no X do Chrome: a gravação segue e você reabre pelo ícone da extensão."
          className="material-symbols-outlined text-[20px] text-on-surface-variant hover:text-primary-fixed transition-colors"
        >
          visibility_off
        </button>
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-error">
          <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse" /> Gravando
        </span>
        <span className={`w-2 h-2 rounded-full ${connected ? 'bg-primary-fixed shadow-[0_0_8px_#00fbfb]' : 'bg-outline'}`} />
      </div>

      {/* Popup: trocar clone ativo */}
      {pickerOpen ? (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setPickerOpen(false)} />
          <div className="absolute top-[52px] left-3 right-3 z-30 bg-[#111214] border border-outline-variant rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.6)] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
              <p className="font-label-caps text-label-caps text-primary-fixed uppercase">Clone ativo</p>
              <button
                onClick={() => setPickerOpen(false)}
                className="material-symbols-outlined text-on-surface-variant hover:text-primary text-[18px]"
              >
                close
              </button>
            </div>
            <div className="max-h-[320px] overflow-y-auto p-2 space-y-1">
              {experts === null && !expertError ? (
                <p className="text-on-surface-variant text-body-sm px-3 py-4">Carregando clones…</p>
              ) : (
                (experts ?? []).map((e) => {
                  const isActive = e.id === activeExpert.id || (!activeExpert.id && e.name === activeExpert.name)
                  return (
                    <button
                      key={e.id}
                      onClick={() => void selectExpert(e)}
                      disabled={expertBusy}
                      className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors disabled:opacity-50 ${
                        isActive
                          ? 'bg-primary-fixed/10 border-primary-fixed'
                          : 'border-transparent hover:bg-white/5'
                      }`}
                    >
                      <span
                        className={`w-8 h-8 rounded-full grid place-items-center text-[13px] font-bold shrink-0 border ${
                          isActive
                            ? 'bg-primary-fixed/15 text-primary-fixed border-primary-fixed/40'
                            : 'bg-surface-container-high text-on-surface-variant border-white/10'
                        }`}
                      >
                        {initial(e.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block text-[13px] font-medium truncate ${isActive ? 'text-primary-fixed' : 'text-primary'}`}
                        >
                          {e.name}
                        </span>
                        {e.tagline ? (
                          <span className="block text-[11px] text-on-surface-variant truncate">{e.tagline}</span>
                        ) : null}
                      </span>
                      {isActive ? (
                        <span className="material-symbols-outlined text-primary-fixed text-[18px] shrink-0">
                          check_circle
                        </span>
                      ) : null}
                    </button>
                  )
                })
              )}
            </div>
            {expertBusy ? (
              <p className="text-on-surface-variant text-[12px] px-4 pb-3">Trocando o clone…</p>
            ) : null}
            {expertError ? <p className="text-error text-[12px] px-4 pb-3">{expertError}</p> : null}
          </div>
        </>
      ) : null}

      {/* Feed único (transcrição + insights em ordem cronológica) */}
      <div ref={feedRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
        {feed.length === 0 && !partial && (
          <p className="text-on-surface-variant text-body-sm">
            Aguardando alguém falar na reunião… O {activeExpert.name ?? 'copiloto'} vai destacar dores,
            objeções e próximos passos aqui{baseName ? `, com base em "${baseName}"` : ''} conforme a
            conversa avança.
          </p>
        )}
        {feed.map((item) =>
          item.kind === 'seg' ? (
            <TranscriptLine key={item.key} seg={item.seg} />
          ) : (
            <InsightCard
              key={item.key}
              sug={item.sug}
              onDismiss={() => setDismissed((prev) => new Set(prev).add(item.sug.id))}
            />
          ),
        )}
        {partial && <TranscriptLine seg={partial} muted />}
        {(feed.length > 0 || partial) && (
          <div className="flex items-center gap-2 text-on-surface-variant text-body-sm pt-1">
            <span className="material-symbols-outlined text-[18px] text-primary-fixed animate-pulse">graphic_eq</span>
            Escutando…
          </div>
        )}
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
  // Perguntas são o coração do copiloto — destaque total na cor da marca.
  const isQuestion = sug.kind === 'question'
  return (
    <div
      className={
        isQuestion
          ? 'bg-primary-fixed/10 border border-primary-fixed rounded-xl p-4 relative shadow-[0_0_18px_rgba(0,251,251,0.18)]'
          : 'bg-[#111214] border border-outline-variant rounded-xl p-4 relative'
      }
    >
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined text-primary-fixed text-[22px] shrink-0">{meta.icon}</span>
        <div className="min-w-0 flex-1">
          <h4
            className={`font-headline-lg text-[15px] mb-1 ${isQuestion ? 'text-primary-fixed font-bold' : 'text-primary'}`}
          >
            {meta.label}
          </h4>
          <p
            className={`leading-relaxed ${
              isQuestion ? 'text-primary text-[15px] font-medium' : 'text-body-sm text-on-surface'
            }`}
          >
            {sug.content}
          </p>
          {sug.rationale && <p className="text-[12px] text-on-surface-variant italic mt-1.5">{sug.rationale}</p>}
          <div className="flex items-center gap-2 mt-3">
            <span
              className={`px-2 py-0.5 rounded font-label-caps text-[10px] ${
                isQuestion
                  ? 'bg-primary-fixed text-on-primary-fixed font-bold'
                  : 'border border-primary-fixed/30 bg-primary-fixed/10 text-primary-fixed'
              }`}
            >
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
