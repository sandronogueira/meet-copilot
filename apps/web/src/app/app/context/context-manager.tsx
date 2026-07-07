'use client'

import { useRef, useState, useTransition } from 'react'
import {
  createBaseAction,
  updateBaseAction,
  deleteBaseAction,
  addDocumentAction,
  updateTextDocumentAction,
  deleteDocumentAction,
  uploadFileDocumentAction,
} from './actions'

const ACCEPTED_FILES = '.pdf,.docx,.doc,.xlsx,.xls,.csv,.md,.markdown,.txt'

export interface BaseDoc {
  id: string
  context_base_id: string
  source_type: string
  title: string
  source_url: string | null
  status: string
  created_at: string
  meta?: { raw_text?: string } | null
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

  const [docKind, setDocKind] = useState<'url' | 'text' | 'file'>('url')
  const [docUrl, setDocUrl] = useState('')
  const [docTitle, setDocTitle] = useState('')
  const [docText, setDocText] = useState('')
  const [docFile, setDocFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // edição/exclusão da base selecionada
  const [editingBase, setEditingBase] = useState(false)
  const [editBaseName, setEditBaseName] = useState('')
  const [editBaseDescription, setEditBaseDescription] = useState('')
  const [confirmDeleteBase, setConfirmDeleteBase] = useState(false)

  // edição inline de documento de texto
  const [editingDocId, setEditingDocId] = useState<string | null>(null)
  const [editDocTitle, setEditDocTitle] = useState('')
  const [editDocText, setEditDocText] = useState('')

  const selected = bases.find((b) => b.id === selectedId) ?? bases[0] ?? null

  function pickBase(id: string) {
    setSelectedId(id)
    setEditingBase(false)
    setConfirmDeleteBase(false)
    setEditingDocId(null)
    setError(null)
  }

  function startEditBase() {
    if (!selected) return
    setEditBaseName(selected.name)
    setEditBaseDescription(selected.description ?? '')
    setEditingBase(true)
    setConfirmDeleteBase(false)
  }

  function startEditDoc(doc: BaseDoc) {
    setEditingDocId(doc.id)
    setEditDocTitle(doc.title)
    setEditDocText(doc.meta?.raw_text ?? '')
  }

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
                onClick={() => pickBase(base.id)}
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
              {editingBase ? (
                <div className="mb-5 space-y-3">
                  <input
                    value={editBaseName}
                    onChange={(e) => setEditBaseName(e.target.value)}
                    placeholder="Nome da base"
                    className="w-full bg-surface-container-high border border-white/10 rounded-lg px-3 py-2 text-primary font-semibold focus:outline-none focus:border-primary-fixed"
                  />
                  <input
                    value={editBaseDescription}
                    onChange={(e) => setEditBaseDescription(e.target.value)}
                    placeholder="Descrição (opcional)"
                    className="w-full bg-surface-container-high border border-white/10 rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-primary-fixed"
                  />
                  <div className="flex gap-2">
                    <button
                      disabled={pending || editBaseName.trim().length < 2}
                      onClick={() =>
                        run(
                          () =>
                            updateBaseAction({
                              id: selected.id,
                              name: editBaseName,
                              description: editBaseDescription,
                            }),
                          () => setEditingBase(false),
                        )
                      }
                      className="bg-surface-tint text-on-primary font-medium rounded-lg px-4 py-2 text-sm hover:shadow-[0_0_15px_rgba(0,221,221,0.3)] transition-all disabled:opacity-50"
                    >
                      Salvar
                    </button>
                    <button
                      onClick={() => setEditingBase(false)}
                      className="px-4 py-2 text-sm text-on-surface-variant border border-white/10 rounded-lg hover:border-white/30"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <h3 className="font-headline-lg text-xl text-primary font-semibold min-w-0">
                      {selected.name}
                    </h3>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        title="Editar nome e descrição da base"
                        onClick={startEditBase}
                        className="material-symbols-outlined text-[18px] text-on-surface-variant hover:text-primary-fixed transition-colors p-1.5 rounded-md hover:bg-white/5"
                      >
                        edit
                      </button>
                      {confirmDeleteBase ? (
                        <span className="flex items-center gap-1.5">
                          <button
                            disabled={pending}
                            onClick={() =>
                              run(
                                () => deleteBaseAction(selected.id),
                                () => {
                                  setConfirmDeleteBase(false)
                                  setSelectedId(null)
                                },
                              )
                            }
                            className="text-[12px] font-bold text-error border border-error/50 rounded-md px-2.5 py-1 hover:bg-error/10 transition-colors"
                          >
                            {pending ? 'Excluindo…' : 'Confirmar exclusão'}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteBase(false)}
                            className="text-[12px] text-on-surface-variant border border-white/10 rounded-md px-2.5 py-1 hover:border-white/30"
                          >
                            Cancelar
                          </button>
                        </span>
                      ) : (
                        <button
                          title="Excluir a base e todos os documentos dela"
                          onClick={() => setConfirmDeleteBase(true)}
                          className="material-symbols-outlined text-[18px] text-on-surface-variant hover:text-error transition-colors p-1.5 rounded-md hover:bg-white/5"
                        >
                          delete
                        </button>
                      )}
                    </div>
                  </div>
                  {confirmDeleteBase ? (
                    <p className="text-error text-[12px] mb-3">
                      Isso apaga a base &quot;{selected.name}&quot; e {selected.documents.length}{' '}
                      documento{selected.documents.length === 1 ? '' : 's'} — sem volta.
                    </p>
                  ) : null}
                  {selected.description ? (
                    <p className="text-on-surface-variant text-body-sm mb-5">{selected.description}</p>
                  ) : (
                    <div className="mb-5" />
                  )}
                </>
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
                <button
                  onClick={() => setDocKind('file')}
                  className={`px-4 py-1.5 rounded-full border text-sm font-medium transition-colors ${
                    docKind === 'file'
                      ? 'border-primary-fixed text-primary-fixed bg-primary-fixed/10'
                      : 'border-white/10 text-on-surface-variant hover:border-white/30'
                  }`}
                >
                  Arquivo
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
              ) : docKind === 'text' ? (
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
              ) : (
                <div className="mb-8 space-y-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_FILES}
                    className="hidden"
                    onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full border border-dashed border-white/20 rounded-lg p-6 text-center text-on-surface-variant hover:border-primary-fixed hover:text-primary-fixed transition-all"
                  >
                    <span className="material-symbols-outlined text-[28px] block mb-1">upload_file</span>
                    {docFile ? (
                      <span className="text-sm font-medium text-primary block truncate">
                        {docFile.name}{' '}
                        <span className="text-on-surface-variant font-normal">
                          ({(docFile.size / 1024 / 1024).toFixed(1)}MB)
                        </span>
                      </span>
                    ) : (
                      <span className="text-sm block">
                        Clique para escolher — PDF, DOCX, XLSX, CSV, MD ou TXT (até 15MB)
                      </span>
                    )}
                  </button>
                  <button
                    disabled={pending || !docFile}
                    onClick={() => {
                      if (!docFile || !selected) return
                      const fd = new FormData()
                      fd.set('contextBaseId', selected.id)
                      fd.set('file', docFile)
                      run(
                        () => uploadFileDocumentAction(fd),
                        () => {
                          setDocFile(null)
                          if (fileInputRef.current) fileInputRef.current.value = ''
                        },
                      )
                    }}
                    className="bg-surface-tint text-on-primary font-medium rounded-lg px-6 py-2 text-sm hover:shadow-[0_0_15px_rgba(0,221,221,0.3)] transition-all disabled:opacity-50"
                  >
                    {pending ? 'Enviando e extraindo texto…' : 'Enviar arquivo'}
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
                  {selected.documents.map((doc) =>
                    editingDocId === doc.id ? (
                      <div key={doc.id} className="pb-4 border-b border-white/5 space-y-3">
                        <input
                          value={editDocTitle}
                          onChange={(e) => setEditDocTitle(e.target.value)}
                          placeholder="Título"
                          className="w-full bg-surface-container-high border border-white/10 rounded-lg px-4 py-2 text-primary text-sm focus:outline-none focus:border-primary-fixed"
                        />
                        <textarea
                          value={editDocText}
                          onChange={(e) => setEditDocText(e.target.value)}
                          rows={5}
                          className="w-full bg-surface-container-high border border-white/10 rounded-lg px-4 py-2 text-primary text-sm focus:outline-none focus:border-primary-fixed resize-none"
                        />
                        <div className="flex gap-2">
                          <button
                            disabled={pending || !editDocTitle || editDocText.length < 20}
                            onClick={() =>
                              run(
                                () =>
                                  updateTextDocumentAction({
                                    id: doc.id,
                                    title: editDocTitle,
                                    text: editDocText,
                                  }),
                                () => setEditingDocId(null),
                              )
                            }
                            className="bg-surface-tint text-on-primary font-medium rounded-lg px-4 py-1.5 text-sm hover:shadow-[0_0_15px_rgba(0,221,221,0.3)] transition-all disabled:opacity-50"
                          >
                            Salvar
                          </button>
                          <button
                            onClick={() => setEditingDocId(null)}
                            className="px-4 py-1.5 text-sm text-on-surface-variant border border-white/10 rounded-lg hover:border-white/30"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
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
                        <div className="flex items-center gap-2 shrink-0">
                          {doc.source_type === 'text' ? (
                            <button
                              disabled={pending}
                              onClick={() => startEditDoc(doc)}
                              className="text-xs border border-white/10 rounded-md px-3 py-1.5 text-on-surface-variant hover:text-primary-fixed hover:border-primary-fixed/50 transition-colors"
                            >
                              Editar
                            </button>
                          ) : null}
                          <button
                            disabled={pending}
                            onClick={() => run(() => deleteDocumentAction(doc.id))}
                            className="text-xs border border-white/10 rounded-md px-3 py-1.5 text-on-surface-variant hover:text-error hover:border-error/50 transition-colors"
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                    ),
                  )}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
