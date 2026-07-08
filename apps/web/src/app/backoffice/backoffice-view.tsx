'use client'

import { useState, useTransition } from 'react'
import { createTesterAction, setUserBanAction, resetTesterPasswordAction } from './actions'

export interface PlatformStats {
  users: number
  workspaces: number
  meetings: number
  meetings_7d: number
  suggestions: number
  tokens_in: number
  tokens_out: number
  proposals: number
}

export interface UserOverviewRow {
  workspace_id: string
  workspace_name: string
  plan: string
  owner_user_id: string
  owner_email: string
  owner_name: string | null
  banned_until: string | null
  last_sign_in_at: string | null
  user_created_at: string
  members: number
  meetings: number
  talk_minutes: number
  tokens_in: number
  tokens_out: number
  suggestions: number
  proposals: number
  reports: number
  last_activity: string | null
}

interface Props {
  stats: PlatformStats
  users: UserOverviewRow[]
}

/** Custo estimado (D3) — pricing de referência US$3/1M tokens in, US$15/1M tokens out. Não é billing real. */
function estimatedCostUsd(tokensIn: number, tokensOut: number): number {
  return (tokensIn * 3 + tokensOut * 15) / 1e6
}

const numberFmt = new Intl.NumberFormat('pt-BR')
const costFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
})

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function isBanned(bannedUntil: string | null): boolean {
  if (!bannedUntil) return false
  return new Date(bannedUntil).getTime() > Date.now()
}

export function BackofficeView({ stats, users }: Props) {
  const [pending, startTransition] = useTransition()
  const [pendingUserId, setPendingUserId] = useState<string | null>(null)

  // form de novo tester
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null)
  const [copied, setCopied] = useState(false)

  // confirmação em 2 cliques por linha (padrão do produto)
  const [confirmBanId, setConfirmBanId] = useState<string | null>(null)
  const [confirmResetId, setConfirmResetId] = useState<string | null>(null)
  const [resetPassword, setResetPassword] = useState<{ userId: string; password: string } | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)

  const platformCost = estimatedCostUsd(stats.tokens_in, stats.tokens_out)

  function submitCreateTester() {
    setFormError(null)
    setCreated(null)
    startTransition(async () => {
      const r = await createTesterAction({ fullName, email })
      if (r.error) {
        setFormError(r.error)
      } else {
        setCreated({ email, password: r.password ?? '' })
        setFullName('')
        setEmail('')
      }
    })
  }

  function toggleBan(userId: string, ban: boolean) {
    setRowError(null)
    setPendingUserId(userId)
    startTransition(async () => {
      const r = await setUserBanAction({ userId, ban })
      if (r.error) setRowError(r.error)
      setConfirmBanId(null)
      setPendingUserId(null)
    })
  }

  function resetPasswordFor(userId: string) {
    setRowError(null)
    setPendingUserId(userId)
    startTransition(async () => {
      const r = await resetTesterPasswordAction({ userId })
      if (r.error) setRowError(r.error)
      else setResetPassword({ userId, password: r.password ?? '' })
      setConfirmResetId(null)
      setPendingUserId(null)
    })
  }

  function copyPassword(password: string) {
    navigator.clipboard.writeText(password).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const field =
    'w-full bg-surface-container-high border border-white/10 rounded-lg px-4 py-2.5 text-primary text-sm focus:outline-none focus:border-primary-fixed transition-colors'
  const label = 'block font-label-caps text-label-caps text-on-surface-variant uppercase mb-2'

  return (
    <div className="max-w-[1200px] mx-auto">
      <header className="mb-8">
        <p className="font-label-caps text-label-caps text-primary-fixed tracking-widest mb-3">
          ADMINISTRAÇÃO
        </p>
        <h1 className="font-display-lg text-3xl text-primary mb-2">Usuários, acessos e consumo</h1>
        <p className="text-on-surface-variant text-body-sm leading-relaxed">
          Visão cross-tenant restrita a superadmin. Custos são estimativas, não faturamento real.
        </p>
      </header>

      {/* Cards de plataforma */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-10">
        <StatCard label="Usuários" value={numberFmt.format(stats.users)} />
        <StatCard label="Reuniões" value={numberFmt.format(stats.meetings)} />
        <StatCard label="Reuniões (7d)" value={numberFmt.format(stats.meetings_7d)} />
        <StatCard label="Sugestões" value={numberFmt.format(stats.suggestions)} />
        <StatCard label="Tokens (in+out)" value={numberFmt.format(stats.tokens_in + stats.tokens_out)} />
        <StatCard label="Custo" value={costFmt.format(platformCost)} hint="estimado" />
      </div>

      {/* Adicionar tester */}
      <div className="bg-[#111214] border border-white/10 rounded-xl p-6 md:p-8 mb-10">
        <h2 className="font-headline-lg text-lg text-primary font-semibold mb-4">Adicionar tester</h2>

        {created ? (
          <div className="bg-surface-container-high border border-primary-fixed/40 rounded-lg p-4 space-y-3">
            <p className="text-body-sm text-primary">
              Tester criado: <span className="font-mono">{created.email}</span>
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-black/30 rounded-md px-3 py-2 text-sm text-primary-fixed font-mono truncate">
                {created.password}
              </code>
              <button
                onClick={() => copyPassword(created.password)}
                className="px-3 py-2 text-sm border border-white/10 rounded-md text-on-surface-variant hover:border-primary-fixed hover:text-primary-fixed transition-colors"
              >
                {copied ? 'Copiado' : 'Copiar'}
              </button>
            </div>
            <p className="text-[12px] text-error">Anote — não será exibida de novo.</p>
            <button
              onClick={() => setCreated(null)}
              className="text-[12px] text-on-surface-variant border border-white/10 rounded-md px-3 py-1.5 hover:border-white/30"
            >
              Fechar
            </button>
          </div>
        ) : (
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1">
              <label className={label}>Nome</label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nome do tester"
                className={field}
              />
            </div>
            <div className="flex-1">
              <label className={label}>E-mail</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tester@empresa.com"
                className={field}
              />
            </div>
            <div className="flex items-end">
              <button
                disabled={pending || fullName.trim().length < 2 || !email.includes('@')}
                onClick={submitCreateTester}
                className="px-5 py-2.5 rounded-md bg-primary-fixed text-on-primary-fixed font-bold text-sm hover:shadow-[0_0_15px_rgba(0,251,251,0.4)] transition-all disabled:opacity-50 whitespace-nowrap"
              >
                {pending ? 'Criando…' : 'Criar tester'}
              </button>
            </div>
          </div>
        )}
        {formError ? <p className="text-error text-body-sm mt-3">{formError}</p> : null}
      </div>

      {/* Tabela de usuários */}
      <div className="bg-[#111214] border border-white/10 rounded-xl p-6 md:p-8 overflow-x-auto">
        <h2 className="font-headline-lg text-lg text-primary font-semibold mb-4">Usuários</h2>
        {rowError ? <p className="text-error text-body-sm mb-4">{rowError}</p> : null}
        <table className="w-full text-sm text-left border-collapse min-w-[960px]">
          <thead>
            <tr className="text-on-surface-variant font-label-caps text-label-caps uppercase border-b border-white/10">
              <th className="py-3 pr-4">Usuário</th>
              <th className="py-3 pr-4">Workspace</th>
              <th className="py-3 pr-4">Status</th>
              <th className="py-3 pr-4">Reuniões</th>
              <th className="py-3 pr-4">Minutos</th>
              <th className="py-3 pr-4">Tokens</th>
              <th className="py-3 pr-4">Custo</th>
              <th className="py-3 pr-4">Último login</th>
              <th className="py-3 pr-4">Última atividade</th>
              <th className="py-3 pr-4">Ações</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const banned = isBanned(u.banned_until)
              const userCost = estimatedCostUsd(u.tokens_in, u.tokens_out)
              const rowPending = pending && pendingUserId === u.owner_user_id
              return (
                <tr key={u.owner_user_id} className="border-b border-white/5">
                  <td className="py-3 pr-4">
                    <div className="flex flex-col">
                      <span className="text-primary font-medium">{u.owner_name ?? '—'}</span>
                      <span className="text-xs text-on-surface-variant font-mono">{u.owner_email}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-on-surface-variant">{u.workspace_name}</td>
                  <td className="py-3 pr-4">
                    <span
                      className={`text-xs font-bold px-2 py-1 rounded-full border ${
                        banned ? 'text-error border-error/50' : 'text-primary-fixed border-primary-fixed/40'
                      }`}
                    >
                      {banned ? 'Bloqueado' : 'Ativo'}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-on-surface-variant">{numberFmt.format(u.meetings)}</td>
                  <td className="py-3 pr-4 text-on-surface-variant">{numberFmt.format(u.talk_minutes)}</td>
                  <td className="py-3 pr-4 text-on-surface-variant">
                    {numberFmt.format(u.tokens_in + u.tokens_out)}
                  </td>
                  <td className="py-3 pr-4 text-on-surface-variant">{costFmt.format(userCost)}</td>
                  <td className="py-3 pr-4 text-on-surface-variant">{formatDate(u.last_sign_in_at)}</td>
                  <td className="py-3 pr-4 text-on-surface-variant">{formatDate(u.last_activity)}</td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      {confirmBanId === u.owner_user_id ? (
                        <span className="flex items-center gap-1.5">
                          <button
                            disabled={rowPending}
                            onClick={() => toggleBan(u.owner_user_id, !banned)}
                            className="text-[12px] font-bold text-error border border-error/50 rounded-md px-2.5 py-1 hover:bg-error/10 transition-colors"
                          >
                            {rowPending ? '…' : 'Confirmar'}
                          </button>
                          <button
                            onClick={() => setConfirmBanId(null)}
                            className="text-[12px] text-on-surface-variant border border-white/10 rounded-md px-2.5 py-1 hover:border-white/30"
                          >
                            Cancelar
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setConfirmBanId(u.owner_user_id)}
                          title={banned ? 'Reativar usuário' : 'Bloquear usuário'}
                          className="material-symbols-outlined text-[18px] text-on-surface-variant hover:text-error transition-colors p-1.5 rounded-md hover:bg-white/5"
                        >
                          {banned ? 'lock_open' : 'lock'}
                        </button>
                      )}

                      {resetPassword?.userId === u.owner_user_id ? (
                        <span className="flex items-center gap-1.5">
                          <code className="bg-black/30 rounded-md px-2 py-1 text-xs text-primary-fixed font-mono">
                            {resetPassword.password}
                          </code>
                          <button
                            onClick={() => copyPassword(resetPassword.password)}
                            className="text-[12px] text-on-surface-variant border border-white/10 rounded-md px-2 py-1 hover:border-white/30"
                          >
                            Copiar
                          </button>
                          <button
                            onClick={() => setResetPassword(null)}
                            className="text-[12px] text-on-surface-variant border border-white/10 rounded-md px-2 py-1 hover:border-white/30"
                          >
                            Fechar
                          </button>
                        </span>
                      ) : confirmResetId === u.owner_user_id ? (
                        <span className="flex items-center gap-1.5">
                          <button
                            disabled={rowPending}
                            onClick={() => resetPasswordFor(u.owner_user_id)}
                            className="text-[12px] font-bold text-primary-fixed border border-primary-fixed/50 rounded-md px-2.5 py-1 hover:bg-primary-fixed/10 transition-colors"
                          >
                            {rowPending ? '…' : 'Confirmar reset'}
                          </button>
                          <button
                            onClick={() => setConfirmResetId(null)}
                            className="text-[12px] text-on-surface-variant border border-white/10 rounded-md px-2.5 py-1 hover:border-white/30"
                          >
                            Cancelar
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setConfirmResetId(u.owner_user_id)}
                          title="Reset de senha"
                          className="material-symbols-outlined text-[18px] text-on-surface-variant hover:text-primary-fixed transition-colors p-1.5 rounded-md hover:bg-white/5"
                        >
                          key
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {users.length === 0 ? (
          <div className="border border-dashed border-white/15 rounded-lg p-8 text-center text-on-surface-variant text-body-sm mt-4">
            Nenhum usuário ainda.
          </div>
        ) : null}
      </div>
    </div>
  )
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-[#111214] border border-white/10 rounded-xl p-4">
      <p className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-1">{label}</p>
      <p className="font-display-lg text-2xl text-primary-fixed">{value}</p>
      {hint ? <p className="text-[11px] text-on-surface-variant mt-1">{hint}</p> : null}
    </div>
  )
}
