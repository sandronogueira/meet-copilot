import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import { isSuperadmin } from '@/lib/superadmin'
import { signOutAction } from '../(auth)/actions'

export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_workspace_id')
    .eq('user_id', user.id)
    .single()
  if (!profile?.default_workspace_id) redirect('/login')

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('name, onboarding_completed_at')
    .eq('id', profile.default_workspace_id)
    .single()

  if (!workspace?.onboarding_completed_at) redirect('/onboarding')

  return (
    <div>
      <header className="app-topbar">
        <span className="brand-mark">
          <span className="brand-dot" /> Meet Copilot
          <span className="mono muted" style={{ fontSize: '0.7rem', marginLeft: '0.8rem' }}>
            {workspace.name}
          </span>
        </span>
        <nav style={{ display: 'flex', gap: '1.4rem', fontSize: '0.875rem' }}>
          <a href="/app" style={{ color: 'var(--fg-dim)' }}>
            Reuniões
          </a>
          <a href="/app/usage" style={{ color: 'var(--fg-dim)' }}>
            Consumo
          </a>
          <a href="/app/context" style={{ color: 'var(--fg-dim)' }}>
            Bases de conhecimento
          </a>
          <a href="/app/experts" style={{ color: 'var(--fg-dim)' }}>
            Especialistas
          </a>
          <a href="/app/profile" style={{ color: 'var(--fg-dim)' }}>
            Perfil
          </a>
          <a href="/app/install" style={{ color: 'var(--fg-dim)' }}>
            Instalar extensão
          </a>
          {isSuperadmin(user.email) ? (
            <a href="/backoffice" style={{ color: 'var(--fg-dim)' }}>
              Backoffice
            </a>
          ) : null}
        </nav>
        <form action={signOutAction}>
          <button className="btn btn-ghost btn-inline" type="submit" style={{ padding: '0.4rem 0.9rem' }}>
            Sair
          </button>
        </form>
      </header>
      <main className="app-main">{children}</main>
    </div>
  )
}
