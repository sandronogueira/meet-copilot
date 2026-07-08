'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { updateMeetingTitleAction, updateReportSummaryAction } from '../../actions'

export interface RegistroData {
  meetingId: string
  title: string
  status: string
  createdAt: string
  baseName: string | null
  segments: { seq: number; speaker_label: string | null; text: string }[]
  report: {
    summary: string
    decisions: string[]
    action_items: { descricao: string; responsavel: string | null; prazo: string | null }[]
    red_flags: string[]
    objections: string[]
    next_steps: string[]
  } | null
  proposals: { slug: string; title: string; created_at: string }[]
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function RegistroView({ data }: { data: RegistroData }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState(data.title)
  const [editingTitle, setEditingTitle] = useState(false)

  const [summary, setSummary] = useState(data.report?.summary ?? '')
  const [editingSummary, setEditingSummary] = useState(false)

  function saveTitle() {
    setError(null)
    startTransition(async () => {
      const r = await updateMeetingTitleAction({ meetingId: data.meetingId, title })
      if (r.error) setError(r.error)
      else setEditingTitle(false)
    })
  }

  function saveSummary() {
    setError(null)
    startTransition(async () => {
      const r = await updateReportSummaryAction({ meetingId: data.meetingId, summary })
      if (r.error) setError(r.error)
      else setEditingSummary(false)
    })
  }

  return (
    <div className="max-w-[880px] mx-auto">
      <Link
        href="/app"
        className="inline-flex items-center gap-1 text-on-surface-variant hover:text-primary-fixed text-[13px] mb-6 transition-colors"
      >
        <span className="material-symbols-outlined text-[16px]">arrow_back</span> Painel
      </Link>

      {/* Cabeçalho: título editável + metadados */}
      <header className="mb-8">
        <p className="font-label-caps text-label-caps text-primary-fixed tracking-widest mb-3">
          REGISTRO DA SESSÃO
        </p>
        {editingTitle ? (
          <div className="flex items-center gap-3 mb-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              className="flex-1 bg-surface-container-high border border-white/10 rounded-lg px-4 py-2.5 text-primary text-2xl font-semibold focus:outline-none focus:border-primary-fixed"
            />
            <button
              disabled={pending || title.trim().length < 2}
              onClick={saveTitle}
              className="bg-primary-fixed text-on-primary-fixed font-bold rounded-lg px-5 py-2.5 text-sm disabled:opacity-50"
            >
              Salvar
            </button>
            <button
              onClick={() => {
                setTitle(data.title)
                setEditingTitle(false)
              }}
              className="text-sm text-on-surface-variant border border-white/10 rounded-lg px-4 py-2.5 hover:border-white/30"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 mb-2 group">
            <h1 className="font-display-lg text-3xl text-primary">{title}</h1>
            <button
              title="Editar o título"
              onClick={() => setEditingTitle(true)}
              className="material-symbols-outlined text-[20px] text-on-surface-variant hover:text-primary-fixed transition-colors"
            >
              edit
            </button>
          </div>
        )}
        <p className="text-on-surface-variant text-body-sm">
          {fmtDate(data.createdAt)}
          {data.baseName ? <> · Base: {data.baseName}</> : <> · Sem base (no escuro)</>}
          {data.status === 'in_call' ? (
            <>
              {' · '}
              <Link href={`/app/meetings/${data.meetingId}`} className="text-primary-fixed underline underline-offset-4">
                painel ao vivo
              </Link>
            </>
          ) : null}
        </p>
        {error ? <p className="text-error text-body-sm mt-2">{error}</p> : null}
      </header>

      {/* Relatório */}
      {data.report ? (
        <section className="bg-[#111214] border border-white/10 rounded-xl p-6 md:p-8 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-headline-lg text-xl text-primary">Resumo executivo</h2>
            {!editingSummary ? (
              <button
                title="Editar o resumo"
                onClick={() => setEditingSummary(true)}
                className="material-symbols-outlined text-[18px] text-on-surface-variant hover:text-primary-fixed transition-colors"
              >
                edit
              </button>
            ) : null}
          </div>

          {editingSummary ? (
            <div className="space-y-3 mb-6">
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={6}
                className="w-full bg-surface-container-high border border-white/10 rounded-lg px-4 py-3 text-primary text-body-sm leading-relaxed focus:outline-none focus:border-primary-fixed resize-none"
              />
              <div className="flex gap-2">
                <button
                  disabled={pending || summary.trim().length < 10}
                  onClick={saveSummary}
                  className="bg-primary-fixed text-on-primary-fixed font-bold rounded-lg px-5 py-2 text-sm disabled:opacity-50"
                >
                  Salvar
                </button>
                <button
                  onClick={() => {
                    setSummary(data.report?.summary ?? '')
                    setEditingSummary(false)
                  }}
                  className="text-sm text-on-surface-variant border border-white/10 rounded-lg px-4 py-2 hover:border-white/30"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <p className="text-body-sm text-on-surface leading-relaxed mb-6 whitespace-pre-line">{summary}</p>
          )}

          <ReportSection title="Decisões" items={data.report.decisions} />
          {data.report.action_items.length > 0 ? (
            <div className="mb-5">
              <h3 className="font-label-caps text-label-caps text-primary-fixed uppercase mb-2">Ações</h3>
              <ul className="space-y-2">
                {data.report.action_items.map((a, i) => (
                  <li key={i} className="text-body-sm text-on-surface bg-surface-container-low border border-white/5 rounded-lg px-3 py-2">
                    {a.descricao}
                    {a.responsavel || a.prazo ? (
                      <span className="block text-[11px] text-on-surface-variant mt-0.5">
                        {a.responsavel ? `Responsável: ${a.responsavel}` : ''}
                        {a.prazo ? ` · Prazo: ${a.prazo}` : ''}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <ReportSection title="Red flags" items={data.report.red_flags} />
          <ReportSection title="Objeções" items={data.report.objections} />
          <ReportSection title="Próximos passos" items={data.report.next_steps} />
        </section>
      ) : (
        <div className="border border-dashed border-white/15 rounded-xl p-6 text-on-surface-variant text-body-sm mb-8">
          Sem relatório ainda — gere pelo painel da reunião com &quot;Finalizar com Relatório&quot;.
        </div>
      )}

      {/* Propostas */}
      {data.proposals.length > 0 ? (
        <section className="bg-[#111214] border border-primary-fixed/30 rounded-xl p-6 mb-8">
          <h2 className="font-headline-lg text-xl text-primary mb-4">Proposta comercial</h2>
          <ul className="space-y-2">
            {data.proposals.map((p) => (
              <li key={p.slug} className="flex items-center justify-between gap-3">
                <span className="text-body-sm text-on-surface truncate">{p.title}</span>
                <a
                  href={`/p/${p.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary-fixed text-[13px] underline underline-offset-4 shrink-0"
                >
                  Abrir página pública
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Transcrição completa */}
      <section className="bg-[#111214] border border-white/10 rounded-xl p-6 md:p-8">
        <h2 className="font-headline-lg text-xl text-primary mb-1">Transcrição</h2>
        <p className="text-on-surface-variant text-[12px] mb-5">
          {data.segments.length} trecho{data.segments.length === 1 ? '' : 's'} registrado
          {data.segments.length === 1 ? '' : 's'}
        </p>
        {data.segments.length === 0 ? (
          <p className="text-on-surface-variant text-body-sm">Nada transcrito nesta sessão.</p>
        ) : (
          <div className="space-y-3 max-h-[520px] overflow-y-auto pr-2">
            {data.segments.map((s) => (
              <div key={s.seq} className="flex gap-3">
                <span className="text-primary-fixed text-[12px] font-bold shrink-0 w-24 truncate pt-0.5">
                  {s.speaker_label ?? 'Participante'}
                </span>
                <p className="text-body-sm text-on-surface leading-relaxed">{s.text}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function ReportSection({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <div className="mb-5">
      <h3 className="font-label-caps text-label-caps text-primary-fixed uppercase mb-2">{title}</h3>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="text-body-sm text-on-surface flex gap-2">
            <span className="text-primary-fixed shrink-0">›</span> {item}
          </li>
        ))}
      </ul>
    </div>
  )
}
