'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export interface ContextBaseOption {
  id: string
  name: string
}

export function MeetingLauncher({ bases }: { bases: ContextBaseOption[] }) {
  const [url, setUrl] = useState('')
  const [baseId, setBaseId] = useState(bases[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function launch() {
    setError(null)
    startTransition(async () => {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ meetingUrl: url, contextBaseId: baseId || undefined }),
      })
      const json = (await res.json()) as { ok: boolean; error?: { message: string } }
      if (!json.ok) {
        setError(json.error?.message ?? 'Não foi possível enviar o bot')
        return
      }
      setUrl('')
      router.refresh()
    })
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.7rem', flexWrap: 'wrap' }}>
        <input
          className="input"
          style={{ flex: '2 1 300px' }}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Cole o link do Meet, Zoom ou Teams"
          inputMode="url"
        />
        <select
          className="input"
          style={{ flex: '1 1 200px' }}
          value={baseId}
          onChange={(e) => setBaseId(e.target.value)}
          aria-label="Base de conhecimento desta reunião"
        >
          {bases.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <button className="btn btn-primary btn-inline" onClick={launch} disabled={pending || !url}>
          {pending ? 'Enviando bot…' : 'Entrar com o copiloto'}
        </button>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      <p className="hint" style={{ marginTop: '0.6rem', color: 'var(--fg-faint)', fontSize: '0.8rem' }}>
        A base escolhida define o contexto que o agente carrega nessa reunião. O assistente entra
        identificado e anuncia a gravação — transparência é regra aqui.
      </p>
    </div>
  )
}
