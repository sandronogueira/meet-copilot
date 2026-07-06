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

  // nova base
  const [showNewBase, setShowNewBase] = useState(false)
  const [baseName, setBaseName] = useState('')
  const [baseDescription, setBaseDescription] = useState('')

  // novo documento
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
    <div>
      <p className="kicker">Bases de conhecimento</p>
      <h1 className="display" style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.6rem)', margin: '0.4rem 0' }}>
        O que o copiloto sabe
      </h1>
      <p className="muted" style={{ marginBottom: '2rem', maxWidth: '60ch' }}>
        Crie uma base por cliente, produto ou tipo de reunião. Na hora de entrar numa call, você
        escolhe qual base o agente carrega — é assim que ele entende o contexto daquela conversa.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1.2rem', alignItems: 'start' }}>
        {/* coluna: lista de bases */}
        <div>
          {bases.map((base) => (
            <button
              key={base.id}
              type="button"
              className="expert-card"
              data-on={selected?.id === base.id}
              style={{ width: '100%', marginBottom: '0.7rem', padding: '0.95rem 1.1rem' }}
              onClick={() => setSelectedId(base.id)}
            >
              <h3 style={{ fontSize: '0.95rem' }}>{base.name}</h3>
              <p className="tagline" style={{ minHeight: 0 }}>
                {base.documents.length} documento{base.documents.length === 1 ? '' : 's'}
                {base.is_default ? ' · padrão' : ''}
              </p>
            </button>
          ))}

          {showNewBase ? (
            <div className="panel" style={{ padding: '1rem' }}>
              <div className="field">
                <label htmlFor="nb-name">Nome da base</label>
                <input
                  id="nb-name"
                  className="input"
                  value={baseName}
                  onChange={(e) => setBaseName(e.target.value)}
                  placeholder="ex.: Cliente Clínica Vida"
                />
              </div>
              <div className="field">
                <label htmlFor="nb-desc">Descrição (opcional)</label>
                <input
                  id="nb-desc"
                  className="input"
                  value={baseDescription}
                  onChange={(e) => setBaseDescription(e.target.value)}
                  placeholder="ex.: reuniões de venda com essa conta"
                />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className="btn btn-primary btn-inline"
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
                >
                  Criar
                </button>
                <button className="btn btn-ghost btn-inline" onClick={() => setShowNewBase(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button className="btn btn-ghost" onClick={() => setShowNewBase(true)}>
              + Nova base
            </button>
          )}
        </div>

        {/* coluna: documentos da base selecionada */}
        {selected ? (
          <div className="panel">
            <div style={{ marginBottom: '1.2rem' }}>
              <h2 className="display" style={{ fontSize: '1.3rem' }}>
                {selected.name}
              </h2>
              {selected.description ? <p className="muted">{selected.description}</p> : null}
            </div>

            {/* adicionar documento */}
            <div style={{ borderBottom: '1px solid var(--line)', paddingBottom: '1.2rem', marginBottom: '1.2rem' }}>
              <div className="chip-row" style={{ marginBottom: '0.8rem' }}>
                <button type="button" className="chip" data-on={docKind === 'url'} onClick={() => setDocKind('url')}>
                  Site / URL
                </button>
                <button type="button" className="chip" data-on={docKind === 'text'} onClick={() => setDocKind('text')}>
                  Texto livre
                </button>
              </div>

              {docKind === 'url' ? (
                <div style={{ display: 'flex', gap: '0.7rem', flexWrap: 'wrap' }}>
                  <input
                    className="input"
                    style={{ flex: '1 1 280px' }}
                    value={docUrl}
                    onChange={(e) => setDocUrl(e.target.value)}
                    placeholder="https://site-do-cliente.com.br"
                    inputMode="url"
                  />
                  <button
                    className="btn btn-primary btn-inline"
                    disabled={pending || !docUrl}
                    onClick={() =>
                      run(
                        () => addDocumentAction({ kind: 'url', contextBaseId: selected.id, url: docUrl }),
                        () => setDocUrl(''),
                      )
                    }
                  >
                    Adicionar
                  </button>
                </div>
              ) : (
                <div>
                  <div className="field">
                    <label htmlFor="doc-title">Título</label>
                    <input
                      id="doc-title"
                      className="input"
                      value={docTitle}
                      onChange={(e) => setDocTitle(e.target.value)}
                      placeholder="ex.: Briefing da conta, diferenciais, história…"
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="doc-text">Conteúdo</label>
                    <textarea
                      id="doc-text"
                      className="input"
                      value={docText}
                      onChange={(e) => setDocText(e.target.value)}
                      placeholder="Cole aqui qualquer conhecimento que o copiloto deva ter nessa base…"
                    />
                  </div>
                  <button
                    className="btn btn-primary btn-inline"
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
                  >
                    Adicionar
                  </button>
                </div>
              )}
              {error ? <p className="form-error">{error}</p> : null}
            </div>

            {/* lista de documentos */}
            {selected.documents.length === 0 ? (
              <div className="empty-state" style={{ padding: '2rem 1rem' }}>
                Base vazia. Adicione o site do cliente, briefings, tabelas — tudo vira conhecimento
                do copiloto.
              </div>
            ) : (
              selected.documents.map((doc) => (
                <div
                  key={doc.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    padding: '0.7rem 0',
                    borderBottom: '1px solid var(--line)',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <p style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.title}</p>
                    <p className="mono muted" style={{ fontSize: '0.7rem' }}>
                      {TYPE_LABEL[doc.source_type] ?? doc.source_type} · {STATUS_LABEL[doc.status] ?? doc.status}
                    </p>
                  </div>
                  <button
                    className="btn btn-ghost btn-inline"
                    style={{ padding: '0.3rem 0.7rem', fontSize: '0.8rem' }}
                    disabled={pending}
                    onClick={() => run(() => deleteDocumentAction(doc.id))}
                  >
                    Remover
                  </button>
                </div>
              ))
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
