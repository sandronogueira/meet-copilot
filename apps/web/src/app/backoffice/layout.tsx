import type { ReactNode } from 'react'
import { requireSuperadmin } from '@/lib/superadmin'

export default async function BackofficeLayout({ children }: { children: ReactNode }) {
  // Guard server-side (D2): quem não está na allowlist recebe 404, sem revelar a rota.
  await requireSuperadmin()

  return (
    <div>
      <header className="app-topbar">
        <span className="brand-mark">
          <span className="brand-dot" /> Meet Copilot
          <span className="mono muted" style={{ fontSize: '0.7rem', marginLeft: '0.8rem' }}>
            backoffice
          </span>
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
          <span
            className="mono"
            style={{
              fontSize: '0.7rem',
              letterSpacing: '0.08em',
              padding: '0.25rem 0.6rem',
              borderRadius: '999px',
              border: '1px solid var(--line-strong)',
              color: 'var(--fg-dim)',
            }}
          >
            BACKOFFICE
          </span>
          <a href="/app" style={{ color: 'var(--fg-dim)', fontSize: '0.875rem' }}>
            ← voltar ao app
          </a>
        </div>
      </header>
      <main className="app-main" style={{ maxWidth: '1200px' }}>
        {children}
      </main>
    </div>
  )
}
