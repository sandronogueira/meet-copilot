'use client'

import { useState, useTransition } from 'react'
import type { LlmKeyState } from '@/lib/llm-keys'
import { removeLlmKeyAction, saveLlmKeyAction } from './actions'

const field =
  'w-full bg-surface-container-high border border-white/10 rounded-lg px-4 py-2.5 text-primary text-sm focus:outline-none focus:border-primary-fixed transition-colors'
const label = 'block font-label-caps text-label-caps text-on-surface-variant uppercase mb-2'
const card = 'bg-[#111214] border border-white/10 rounded-xl p-6 md:p-8 space-y-6'
const primaryBtn =
  'w-full px-4 py-3 rounded-md bg-primary-fixed text-on-primary-fixed font-bold text-sm hover:shadow-[0_0_15px_rgba(0,251,251,0.4)] transition-all disabled:opacity-50'
const ghostBtn =
  'bg-transparent text-sm text-on-surface-variant border border-white/10 rounded-lg px-4 py-2.5 hover:border-white/30 transition-colors disabled:opacity-50'

const STEPS = [
  'Crie uma conta em console.anthropic.com. A Anthropic é a empresa que faz o Claude, a IA do copiloto.',
  'Coloque crédito na conta, em "Billing". Sem crédito a chave não funciona.',
  'Em "API Keys", clique em "Create Key" e copie a chave. Ela começa com sk-ant-.',
]

function fmtDate(iso: string | null): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })
}

export function IaForm({ state }: { state: LlmKeyState }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [replacing, setReplacing] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null)

  function save() {
    setError(null)
    setDone(null)
    setBusy('save')
    startTransition(async () => {
      const r = await saveLlmKeyAction({ apiKey })
      if (r.error) setError(r.error)
      else {
        // a chave some da tela assim que é guardada: daqui em diante só os 4 últimos caracteres
        setApiKey('')
        setReplacing(false)
        setDone('Chave conectada. O copiloto já usa a IA da sua empresa.')
      }
      setBusy(null)
    })
  }

  function remove() {
    setError(null)
    setDone(null)
    setBusy('remove')
    startTransition(async () => {
      const r = await removeLlmKeyAction()
      if (r.error) setError(r.error)
      else setDone('Chave removida. O copiloto voltou a usar a nossa IA.')
      setConfirmRemove(false)
      setBusy(null)
    })
  }

  const keyField = (
    <div>
      <label className={label} htmlFor="llm-key">
        Chave da Anthropic
      </label>
      <input
        id="llm-key"
        type="password"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder="sk-ant-…"
        autoComplete="off"
        spellCheck={false}
        className={field}
      />
      <p className="text-[12px] text-on-surface-variant mt-1.5">
        Testamos a chave antes de guardar. Ela fica cifrada e não aparece de novo na tela.
      </p>
    </div>
  )

  const saveButton = (
    <button onClick={save} disabled={pending || apiKey.trim().length < 20} className={primaryBtn}>
      {busy === 'save' ? 'Testando a chave…' : 'Testar e conectar'}
    </button>
  )

  return (
    <div className="max-w-[560px] mx-auto">
      <header className="mb-8">
        <p className="font-label-caps text-label-caps text-primary-fixed tracking-widest mb-3">IA DO COPILOTO</p>
        <h1 className="font-display-lg text-3xl text-primary mb-2">Use a IA da sua empresa</h1>
        <p className="text-on-surface-variant text-body-sm leading-relaxed">
          O copiloto já funciona com a nossa IA. Se preferir, conecte a conta de IA da sua empresa: o
          consumo passa a sair da conta dela, e o copiloto continua igual.
        </p>
      </header>

      {state.mode === 'unavailable' ? (
        <div className={card}>
          <p className="text-on-surface-variant text-body-sm">
            Esta configuração está indisponível no momento. Tente de novo mais tarde.
          </p>
        </div>
      ) : null}

      {state.mode === 'team' ? (
        <div className={card}>
          <div>
            <p className="text-primary font-medium mb-1">Sua conta usa a IA da equipe {state.teamName}</p>
            <p className="text-on-surface-variant text-body-sm leading-relaxed">
              Você não precisa fazer nada. A chave é cuidada por quem administra a equipe.
            </p>
          </div>
          {!state.working ? (
            <p className="text-error text-body-sm">
              A chave da equipe está com problema. Enquanto isso, o copiloto usa a nossa IA.
            </p>
          ) : null}
        </div>
      ) : null}

      {state.mode === 'own' ? (
        <div className={card}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-primary font-medium mb-1">Chave terminada em ••••{state.hint}</p>
              <p className="text-on-surface-variant text-body-sm">
                {state.working
                  ? `Conectada${fmtDate(state.testedAt) ? ` e testada em ${fmtDate(state.testedAt)}` : ''}.`
                  : 'Parou de funcionar.'}
              </p>
            </div>
            <span
              className={`text-xs font-bold px-2 py-1 rounded-full border shrink-0 ${
                state.working ? 'text-primary-fixed border-primary-fixed/40' : 'text-error border-error/50'
              }`}
            >
              {state.working ? 'Ativa' : 'Com problema'}
            </span>
          </div>

          {!state.working ? (
            <p className="text-error text-body-sm">
              {state.lastError ?? 'A Anthropic recusou a chave.'} Enquanto isso, o copiloto usa a nossa IA.
              Cole uma chave nova para voltar a usar a sua.
            </p>
          ) : null}

          {replacing || !state.working ? (
            <>
              {keyField}
              {saveButton}
            </>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {state.working && !replacing ? (
              <button onClick={() => setReplacing(true)} disabled={pending} className={ghostBtn}>
                Trocar a chave
              </button>
            ) : null}
            {confirmRemove ? (
              <>
                <button
                  onClick={remove}
                  disabled={pending}
                  className="bg-transparent text-sm font-bold text-error border border-error/50 rounded-lg px-4 py-2.5 hover:bg-error/10 transition-colors disabled:opacity-50"
                >
                  {busy === 'remove' ? 'Removendo…' : 'Confirmar remoção'}
                </button>
                <button onClick={() => setConfirmRemove(false)} disabled={pending} className={ghostBtn}>
                  Cancelar
                </button>
              </>
            ) : (
              <button onClick={() => setConfirmRemove(true)} disabled={pending} className={ghostBtn}>
                Remover a chave
              </button>
            )}
          </div>
        </div>
      ) : null}

      {state.mode === 'none' ? (
        <div className={card}>
          <div>
            <p className={label}>Como conseguir a chave</p>
            <ol className="space-y-3">
              {STEPS.map((step, i) => (
                <li key={step} className="flex gap-3 text-body-sm text-on-surface leading-relaxed">
                  <span className="shrink-0 w-6 h-6 rounded-full border border-primary-fixed/40 text-primary-fixed text-[12px] font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noreferrer"
              className="inline-block mt-3 text-primary-fixed text-[13px] underline underline-offset-4"
            >
              Abrir o painel da Anthropic
            </a>
          </div>
          {keyField}
          {saveButton}
        </div>
      ) : null}

      {error ? <p className="text-error text-body-sm mt-4">{error}</p> : null}
      {done ? <p className="text-primary-fixed text-body-sm mt-4">{done}</p> : null}
    </div>
  )
}
