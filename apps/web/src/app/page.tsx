import Link from 'next/link'

export default function Home() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: '2rem',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 680 }}>
        <p className="kicker" style={{ marginBottom: '1.2rem' }}>
          Meet Copilot
        </p>
        <h1 className="display" style={{ fontSize: 'clamp(2.2rem, 5.5vw, 4rem)' }}>
          Entre na reunião sem saber nada.
          <br />
          <em style={{ fontStyle: 'normal', color: 'var(--accent)' }}>Saia como especialista.</em>
        </h1>
        <p className="muted" style={{ margin: '1.5rem auto 2.2rem', maxWidth: '46ch' }}>
          Perguntas certas na hora certa, fact-check do que dizem na mesa e proposta comercial
          pronta antes do "obrigado, a gente se fala".
        </p>
        <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/signup" className="btn btn-primary btn-inline" style={{ textDecoration: 'none' }}>
            Criar conta
          </Link>
          <Link href="/login" className="btn btn-ghost btn-inline" style={{ textDecoration: 'none' }}>
            Entrar
          </Link>
        </div>
      </div>
    </main>
  )
}
