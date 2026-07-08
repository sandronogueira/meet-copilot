'use client'

import { useState, useTransition } from 'react'
import { updateProfileAction } from './actions'

interface Props {
  email: string
  fullName: string
  selfLabel: string
  workspaceName: string
}

export function ProfileForm(props: Props) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const [fullName, setFullName] = useState(props.fullName)
  const [selfLabel, setSelfLabel] = useState(props.selfLabel)
  const [workspaceName, setWorkspaceName] = useState(props.workspaceName)

  function submit() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const r = await updateProfileAction({ fullName, selfLabel, workspaceName })
      if (r.error) setError(r.error)
      else setSaved(true)
    })
  }

  const field =
    'w-full bg-surface-container-high border border-white/10 rounded-lg px-4 py-2.5 text-primary text-sm focus:outline-none focus:border-primary-fixed transition-colors'
  const label = 'block font-label-caps text-label-caps text-on-surface-variant uppercase mb-2'

  return (
    <div className="max-w-[560px] mx-auto">
      <header className="mb-8">
        <p className="font-label-caps text-label-caps text-primary-fixed tracking-widest mb-3">PERFIL</p>
        <h1 className="font-display-lg text-3xl text-primary mb-2">Seus dados</h1>
        <p className="text-on-surface-variant text-body-sm leading-relaxed">
          Nome, como você aparece nas transcrições e o nome do seu workspace.
        </p>
      </header>

      <div className="bg-[#111214] border border-white/10 rounded-xl p-6 md:p-8 space-y-6">
        <div>
          <label className={label}>E-mail</label>
          <input value={props.email} disabled className={`${field} opacity-60 cursor-not-allowed`} />
          <p className="text-[12px] text-on-surface-variant mt-1.5">
            O e-mail de login não pode ser alterado por aqui.
          </p>
        </div>

        <div>
          <label className={label}>Nome completo</label>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Seu nome"
            className={field}
          />
        </div>

        <div>
          <label className={label}>Como aparecer na transcrição</label>
          <input
            value={selfLabel}
            onChange={(e) => setSelfLabel(e.target.value)}
            placeholder={fullName || 'Ex: Sandro'}
            className={field}
          />
          <p className="text-[12px] text-on-surface-variant mt-1.5">
            É o rótulo das SUAS falas no painel e no registro da reunião. Vazio = usa o nome
            completo. Vale a partir da próxima reunião.
          </p>
        </div>

        <div>
          <label className={label}>Empresa / Workspace</label>
          <input
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
            placeholder="Nome da empresa"
            className={field}
          />
          <p className="text-[12px] text-on-surface-variant mt-1.5">
            Aparece no topo do app e nos documentos gerados.
          </p>
        </div>

        {error ? <p className="text-error text-body-sm">{error}</p> : null}
        {saved ? <p className="text-primary-fixed text-body-sm">Dados salvos.</p> : null}

        <button
          onClick={submit}
          disabled={pending || fullName.trim().length < 2 || workspaceName.trim().length < 2}
          className="w-full px-4 py-3 rounded-md bg-primary-fixed text-on-primary-fixed font-bold text-sm hover:shadow-[0_0_15px_rgba(0,251,251,0.4)] transition-all disabled:opacity-50"
        >
          {pending ? 'Salvando…' : 'Salvar alterações'}
        </button>
      </div>
    </div>
  )
}
