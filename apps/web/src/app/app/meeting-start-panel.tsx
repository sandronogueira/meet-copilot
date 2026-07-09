'use client'

import { useEffect, useState } from 'react'
import { MeetingLauncher, type ContextBaseOption } from './meeting-launcher'

/**
 * Painel "Nova reunião" do dashboard. Detecta se a EXTENSÃO está instalada
 * (via content script detect.js, que marca `data-meet-copilot` no <html> e
 * dispara o evento `meet-copilot-present`) e troca o convite de instalação
 * por uma confirmação — para não ficar pedindo para instalar quem já instalou.
 */
export function MeetingStartPanel({ bases }: { bases: ContextBaseOption[] }) {
  const [installed, setInstalled] = useState<boolean | null>(null)

  useEffect(() => {
    const check = () => document.documentElement.hasAttribute('data-meet-copilot')
    if (check()) {
      setInstalled(true)
      return
    }
    // extensão pode carregar depois da página → escuta o anúncio
    const onPresent = () => setInstalled(true)
    window.addEventListener('meet-copilot-present', onPresent)
    // fallback: reconfirma por ~2s (content script em document_start costuma
    // chegar antes, mas cobrimos a corrida) e então assume "não instalada"
    const t1 = setTimeout(() => check() && setInstalled(true), 400)
    const t2 = setTimeout(() => setInstalled((prev) => prev ?? false), 2000)
    return () => {
      window.removeEventListener('meet-copilot-present', onPresent)
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [])

  return (
    <>
      {installed ? (
        <>
          <p style={{ color: 'var(--fg)', lineHeight: 1.6, marginBottom: '0.4rem' }}>
            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Extensão instalada.</span> Abra
            sua reunião no <strong>Google Meet</strong> e clique no ícone do Meet Copilot no Chrome —
            escolha a base e o clone no painel e pronto.
          </p>
          <p style={{ marginBottom: '1rem' }}>
            <a href="/app/install" style={{ color: 'var(--fg-dim)', fontSize: '0.82rem' }}>
              Ver instruções de instalação
            </a>
          </p>
        </>
      ) : (
        <>
          <p style={{ color: 'var(--fg)', lineHeight: 1.6, marginBottom: '0.9rem' }}>
            Abra sua reunião no <strong>Google Meet</strong> e clique no ícone do Meet Copilot no
            Chrome — escolha a base e o clone no painel e pronto: transcrição e sugestões em tempo
            real, sem bot entrando na sala.
          </p>
          <div style={{ display: 'flex', gap: '0.7rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <a className="btn btn-primary btn-inline" href="/app/install" style={{ textDecoration: 'none' }}>
              Instalar a extensão
            </a>
          </div>
        </>
      )}

      <details>
        <summary
          style={{ cursor: 'pointer', color: 'var(--fg-dim)', fontSize: '0.85rem' }}
          title="Envia um bot para a sala em vez de usar a extensão — útil quando você não está no Chrome"
        >
          Modo alternativo: entrar com bot na reunião (beta)
        </summary>
        <div style={{ marginTop: '0.9rem' }}>
          <MeetingLauncher bases={bases} />
        </div>
      </details>
    </>
  )
}
