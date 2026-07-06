import type { ReactNode } from 'react'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-shell">
      <aside className="auth-brand">
        <div>
          <span className="brand-mark">
            <span className="brand-dot" /> Meet Copilot
          </span>
          <h1 className="display">
            Entre na reunião sem saber nada. <em>Saia como especialista.</em>
          </h1>
        </div>
        <p className="foot">PERGUNTAS CERTAS · FACT-CHECK AO VIVO · PROPOSTA EM 1 CLIQUE</p>
      </aside>
      <main className="auth-panel">{children}</main>
    </div>
  )
}
