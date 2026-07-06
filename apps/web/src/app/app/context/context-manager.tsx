'use client'

import { useState, useTransition } from 'react'
import { createBaseAction, addDocumentAction, deleteDocumentAction } from './actions'

export interface BaseDoc {
  id: string
  context_base_id: string
  source_type: string
  title: string
  source_url: string | null
  status: string
  created_at: string
}

export interface BaseWithDocs {
  id: string
  name: string
  description: string | null
  is_default: boolean
  created_at: string
  documents: BaseDoc[]
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'na fila',
  processing: 'processando',
  ready: 'pronta',
  error: 'erro',
}

const TYPE_LABEL: Record<string, string> = {
  url: 'Site/URL',
  text: 'Texto',
  file: 'Arquivo',
  pricing_table: 'Tabela de preços',
  case: 'Case',
  onboarding_profile: 'Perfil (onboarding)',
}

export function ContextManager({ bases }: { bases: BaseWithDocs[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(bases[0]?.id ?? null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const [showNewBase, setShowNewBase] = useState(false)
  const [baseName, setBaseName] = useState('')
  const [baseDescription, setBaseDescription] = useState('')

  const [docKind, setDocKind] = useState<'url' | 'text'>('url')
  const [docUrl, setDocUrl] = useState('')
  const [docTitle, setDocTitle] = useState('')
  const [docText, setDocText] = useState('')

  const selected = bases.find((b) => b.id === selectedId) ?? bases[0] ?? null

  function run(action: () => Promise<{ error?: string }>, onOk?: () => void) {
    setError(null)
    startTransition(async () => {
      const r = await action()
      if (r.error) setError(r.error)
      else onOk?.()
    })
  }

  return (
    <div className="max-w-[1024px] mx-auto">
      <header className="mb-8 max-w-2xl">
        <p className="font-label-caps text-label-caps text-primary-fixed tracking-widest mb-4">
          BASES DE CONHECIMENTO
        </p>
        <h1 className="font-display-lg text-3xl md:text-4xl text-primary mb-3 tracking-tight">
          O que o seu copiloto deve saber?
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
          Adicione sites, documentos ou textos para o agente ter contexto durante as reuniões. Na
          hora de entrar numa call, você escolhe qual base ele carrega.
        </p>
      </header>

      <div className="flex flex-col xl:flex-row gap-6 items-start">
        {/* Lista de bases */}
        <div className="w-full xl:w-64 flex flex-col gap-3 shrink-0">
          {bases.map((base) => {
            const on = selected?.id === base.id
            return (
              <button
                key={base.id}
                type="button"
                onClick={() => setSelectedId(base.id)}
                className={`rounded-lg p-4 text-left transition-all flex flex-col gap-1 ${
                  on
                    ? 'border border-primary-fixed bg-surface-container-highest text-primary glow-active'
                    : 'border border-white/5 bg-surface text-on-surface-variant hover:border-white/20'
                }`}
              >
                <span className="font-medium text-sm">{base.name}</span>
                <span className="text-xs opacity-70">
                  {base.documents.length} documento{base.documents.length === 1 ? '' : 's'}
                  {base.is_default ? ' · padrão' : ''}
                </span>
              </button>
            )
          })}

          {showNewBase ? (
            <div className="bg-surface border border-white/10 rounded-lg p-4 space-y-3">
              <input
                value={baseName}
                onChange={(e) => setBaseName(e.target.value)}
                placeholder="Nome da base"
                className="w-full bg-surface-container-high border border-white/10 rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-primary-fixed"
              />
              <input
                value={baseDescription}
                onChange={(e) => setBaseDescription(e.target.value)}
                placeholder="Descrição (opcional)"
                className="w-full bg-surface-container-high border border-white/10 rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-primary-fixed"
              />
              <div className="flex gap-2">
                <button
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => createBaseAction({ name: baseName, description: baseDescription }),
                      () => {
                        setBaseName('')
                        setBaseDescription('')
                        setShowNewBase(false)
                      },
                    )
                  }
                  className="flex-1 bg-surface-tint text-on-primary font-medium rounded-lg px-3 py-2 text-sm hover:shadow-[0_0_15px_rgba(0,221,221,0.3)] transition-all"
                >
                  Criar
                </button>
                <button
                  onClick={() => setShowNewBase(false)}
                  className="px-3 py-2 text-sm text-on-surface-variant border border-white/10 rounded-lg hover:border-white/30"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowNewBase(true)}
              className="border border-dashed border-white/20 text-on-surface-variant rounded-lg p-3 text-center hover:border-primary-fixed hover:text-primary-fixed transition-all text-sm font-medium flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              Nova base
            </button>
          )}
        </div>

        {/* Card central */}
        {selected ? (
          <div className="flex-1 w-full bg-[#111214] border border-white/10 rounded-xl p-6 md:p-8 relative">
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent rounded-xl pointer-events-none" />
            <div className="relative z-10">
              <h3 className="font-headline-lg text-xl text-primary mb-1 font-semibold">{selected.name}</h3>
              {selected.description ? (
                <p className="text-on-surface-variant text-body-sm mb-5">{selected.description}</p>
              ) : (
                <div className="mb-5" />
              )}

              {/* Tabs */}
              <div className="flex gap-2 mb-6">
                <button
                  onClick={() => setDocKind('url')}
                  className={`px-4 py-1.5 rounded-full border text-sm font-medium transition-colors ${
                    docKind === 'url'
                      ? 'border-primary-fixed text-primary-fixed bg-primary-fixed/10'
                      : 'border-white/10 text-on-surface-variant hover:border-white/30'
                  }`}
                >
                  Site / URL
                </button>
                <button
                  onClick={() => setDocKind('text')}
                  className={`px-4 py-1.5 rounded-full border text-sm font-medium transition-colors ${
                    docKind === 'text'
                      ? 'border-primary-fixed text-primary-fixed bg-primary-fixed/10'
                      : 'border-white/10 text-on-surface-variant hover:border-white/30'
                  }`}
                >
                  Texto livre
                </button>
              </div>

              {/* Input */}
              {docKind === 'url' ? (
                <div className="flex gap-3 mb-8">
                  <input
                    value={docUrl}
                    onChange={(e) => setDocUrl(e.target.value)}
                    placeholder="https://site-do-cliente.com.br"
                    className="flex-1 bg-surface-container-high border border-white/10 rounded-lg px-4 py-2 text-primary placeholder-on-surface-variant focus:outline-none focus:border-primary-fixed text-sm"
                  />
                  <button
                    disabled={pending || !docUrl}
                    onClick={() =>
                      run(
                        () => addDocumentAction({ kind: 'url', contextBaseId: selected.id, url: docUrl }),
                        () => setDocUrl(''),
                      )
                    }
                    className="bg-surface-tint text-on-primary font-medium rounded-lg px-6 py-2 text-sm hover:shadow-[0_0_15px_rgba(0,221,221,0.3)] transition-all disabled:opacity-50"
                  >
                    Adicionar
                  </button>
                </div>
              ) : (
                <div className="mb-8 space-y-3">
                  <input
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                    placeholder="Título (ex: Briefing da conta)"
                    className="w-full bg-surface-container-high border border-white/10 rounded-lg px-4 py-2 text-primary text-sm focus:outline-none focus:border-primary-fixed"
                  />
                  <textarea
                    value={docText}
                    onChange={(e) => setDocText(e.target.value)}
                    rows={4}
                    placeholder="Cole aqui qualquer conhecimento que o copiloto deva ter nessa base…"
                    className="w-full bg-surface-container-high border border-white/10 rounded-lg px-4 py-2 text-primary text-sm focus:outline-none focus:border-primary-fixed resize-none"
                  />
                  <button
                    disabled={pending || !docTitle || !docText}
                    onClick={() =>
                      run(
                        () =>
                          addDocumentAction({
                            kind: 'text',
                            contextBaseId: selected.id,
                            title: docTitle,
                            text: docText,
                          }),
                        () => {
                          setDocTitle('')
                          setDocText('')
                        },
                      )
                    }
                    className="bg-surface-tint text-on-primary font-medium rounded-lg px-6 py-2 text-sm hover:shadow-[0_0_15px_rgba(0,221,221,0.3)] transition-all disabled:opacity-50"
                  >
                    Adicionar
                  </button>
                </div>
              )}

              {error ? <p className="text-error text-body-sm mb-4">{error}</p> : null}

              {/* Lista de documentos */}
              {selected.documents.length === 0 ? (
                <div className="border border-dashed border-white/15 rounded-lg p-8 text-center text-on-surface-variant text-body-sm">
                  Base vazia. Adicione o site do cliente, briefings, tabelas — tudo vira conhecimento
                  do copiloto.
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {selected.documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between pb-4 border-b border-white/5"
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-medium text-primary truncate">{doc.title}</span>
                        <span className="text-xs text-on-surface-variant font-mono mt-1">
                          {TYPE_LABEL[doc.source_type] ?? doc.source_type} ·{' '}
                          {STATUS_LABEL[doc.status] ?? doc.status}
                        </span>
                      </div>
                      <button
                        disabled={pending}
                        onClick={() => run(() => deleteDocumentAction(doc.id))}
                        className="text-xs border border-white/10 rounded-md px-3 py-1.5 text-on-surface-variant hover:text-error hover:border-error/50 transition-colors shrink-0"
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
