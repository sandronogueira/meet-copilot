'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { selectExpertAction, deleteCustomExpertAction } from './actions'

export interface ExpertCard {
  id: string
  name: string
  tagline: string
  category: string | null
  avatar_url: string | null
  sample_questions: string[]
  scope: 'global' | 'workspace'
}

function initials(name: string): string {
  const clean = name.replace(/^(O|A)\s+/, '')
  return clean.charAt(0).toUpperCase()
}

const HIGHLIGHT = new Set(['Alta Performance', 'Seu Modelo'])

export function ExpertsGallery({
  experts,
  selectedId,
}: {
  experts: ExpertCard[]
  selectedId: string | null
}) {
  const [selected, setSelected] = useState<string | null>(selectedId)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  function pick(id: string) {
    setError(null)
    setSelected(id)
    startTransition(async () => {
      const r = await selectExpertAction(id)
      if (r.error) {
        setError(r.error)
        setSelected(selectedId)
      }
    })
  }

  function remove(id: string) {
    setError(null)
    startTransition(async () => {
      const r = await deleteCustomExpertAction(id)
      if (r.error) setError(r.error)
      else {
        setConfirmDeleteId(null)
        if (selected === id) setSelected(null)
      }
    })
  }

  return (
    <div className="max-w-[1024px] mx-auto">
      <header className="mb-10">
        <p className="font-label-caps text-label-caps text-primary-fixed tracking-widest mb-4">
          CLONES DE PERSONALIDADE
        </p>
        <h1 className="font-display-lg text-3xl md:text-display-lg text-primary mb-4">
          Dê uma personalidade ao seu agente
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl leading-relaxed">
          Escolha um clone de especialista ou uma metodologia para guiar o comportamento do seu
          copiloto nas reuniões. Dá para trocar a qualquer momento.
        </p>
        {error ? <p className="text-error text-body-sm mt-3">{error}</p> : null}
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        {experts.map((expert) => {
          const isSel = selected === expert.id
          const hot = expert.category ? HIGHLIGHT.has(expert.category) : false
          const own = expert.scope === 'workspace'
          const confirming = confirmDeleteId === expert.id
          return (
            <div key={expert.id} className="relative">
              <button
                type="button"
                onClick={() => pick(expert.id)}
                disabled={pending}
                className={`w-full text-left bg-[#111214] rounded-xl p-6 relative overflow-hidden transition-colors duration-300 cursor-pointer ${
                  isSel
                    ? 'border border-primary-fixed glow-effect'
                    : 'border border-outline-variant hover:border-primary-fixed'
                }`}
              >
                <div className="flex items-start gap-4">
                  {expert.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={expert.avatar_url}
                      alt={expert.name}
                      className={`w-16 h-16 rounded-full object-cover shrink-0 border ${
                        isSel ? 'border-primary-fixed' : 'border-outline-variant'
                      }`}
                    />
                  ) : (
                    <div
                      className={`w-16 h-16 rounded-full grid place-items-center shrink-0 font-display-lg text-2xl font-bold ${
                        isSel
                          ? 'border border-primary-fixed text-primary-fixed bg-primary-fixed/10'
                          : 'border border-outline-variant text-on-surface-variant bg-surface-container'
                      }`}
                    >
                      {initials(expert.name)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0 pr-16">
                    <h3 className="font-headline-lg text-xl text-primary mb-1">{expert.name}</h3>
                    {expert.category ? (
                      <span
                        className={`inline-block px-2 py-1 rounded font-label-caps text-[10px] mb-3 border ${
                          hot
                            ? 'border-primary-fixed/30 bg-primary-fixed/10 text-primary-fixed'
                            : 'border-outline-variant text-on-surface-variant'
                        }`}
                      >
                        {expert.category}
                      </span>
                    ) : null}
                    <p className="font-body-sm text-body-sm text-on-surface-variant">{expert.tagline}</p>
                  </div>
                </div>
              </button>

              {/* Canto superior direito: seleção (globais) OU controles (próprios) */}
              {own ? (
                <div className="absolute top-4 right-4 flex items-center gap-1.5 z-10">
                  {isSel ? (
                    <span
                      className="material-symbols-outlined text-primary-fixed text-[20px] mr-0.5"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      check_circle
                    </span>
                  ) : null}
                  {confirming ? (
                    <>
                      <button
                        onClick={() => remove(expert.id)}
                        disabled={pending}
                        className="text-[11px] font-bold text-error border border-error/50 rounded-md px-2 py-1 hover:bg-error/10 transition-colors"
                      >
                        {pending ? 'Excluindo…' : 'Excluir'}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-[11px] text-on-surface-variant border border-outline-variant rounded-md px-2 py-1 hover:border-white/30"
                      >
                        Não
                      </button>
                    </>
                  ) : (
                    <>
                      <Link
                        href={`/app/experts/${expert.id}/edit`}
                        title="Editar este clone"
                        className="material-symbols-outlined text-[18px] text-on-surface-variant hover:text-primary-fixed transition-colors p-1.5 rounded-md hover:bg-white/5"
                      >
                        edit
                      </Link>
                      <button
                        onClick={() => setConfirmDeleteId(expert.id)}
                        title="Excluir este clone"
                        className="material-symbols-outlined text-[18px] text-on-surface-variant hover:text-error transition-colors p-1.5 rounded-md hover:bg-white/5"
                      >
                        delete
                      </button>
                    </>
                  )}
                </div>
              ) : isSel ? (
                <div className="absolute top-4 right-4 text-primary-fixed z-10 pointer-events-none">
                  <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                    check_circle
                  </span>
                </div>
              ) : null}
            </div>
          )
        })}

        {/* Card: criar clone personalizado */}
        <Link
          href="/app/experts/new"
          className="bg-surface-container-low border border-dashed border-primary-fixed/50 rounded-xl p-6 relative overflow-hidden group hover:border-primary-fixed hover:bg-primary-fixed/5 transition-all duration-300 cursor-pointer block"
        >
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-full border border-dashed border-primary-fixed/50 bg-surface-container grid place-items-center shrink-0">
              <span className="material-symbols-outlined text-primary-fixed text-[32px]">person_add</span>
            </div>
            <div className="flex-1">
              <h3 className="font-headline-lg text-xl text-primary mb-1">Criar Clone Personalizado</h3>
              <span className="inline-block px-2 py-1 rounded border border-primary-fixed/30 font-label-caps text-[10px] text-primary-fixed mb-3">
                Seu Modelo
              </span>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Molde um agente único: tom de voz, papel, comportamento e nível de interrupção.
              </p>
            </div>
          </div>
        </Link>
      </div>
    </div>
  )
}
