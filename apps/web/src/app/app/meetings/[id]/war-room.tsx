'use client'

import { useEffect, useRef, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'

interface SegmentEvent {
  speaker: string
  text: string
  isFinal: boolean
  seq: number | null
  ts: number
}

interface SuggestionEvent {
  id: string
  kind: 'question' | 'insight' | 'objection' | 'next_step' | 'risk'
  content: string
  rationale?: string
  ts: number
}

const KIND_LABEL: Record<SuggestionEvent['kind'], string> = {
  question: 'Pergunte',
  insight: 'Insight',
  objection: 'Objeção',
  next_step: 'Próximo passo',
  risk: 'Atenção',
}

interface Props {
  meetingId: string
  title: string
  initialStatus: string
  baseName: string | null
  expertName: string | null
}

/**
 * War Room v1 — transcrição ao vivo via Realtime Broadcast + coluna do copiloto.
 * Botão "Janela flutuante" usa Document Picture-in-Picture (fica por cima do
 * Meet, estilo painel do Claude) com fallback para popup.
 */
export function WarRoom({ meetingId, title, initialStatus, baseName, expertName }: Props) {
  const [finals, setFinals] = useState<SegmentEvent[]>([])
  const [partial, setPartial] = useState<SegmentEvent | null>(null)
  const [suggestions, setSuggestions] = useState<SuggestionEvent[]>([])
  const [connected, setConnected] = useState(false)
  const [floating, setFloating] = useState(false)

  const rootRef = useRef<HTMLDivElement>(null)
  const homeRef = useRef<HTMLDivElement>(null)
  const feedRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const supabase = supabaseBrowser()
    const channel = supabase
      .channel(`meeting:${meetingId}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'segment' }, ({ payload }) => {
        const seg = payload as SegmentEvent
        if (seg.isFinal) {
          setPartial(null)
          setFinals((prev) => [...prev.slice(-200), seg])
        } else {
          setPartial(seg)
        }
      })
      .on('broadcast', { event: 'suggestion' }, ({ payload }) => {
        const s = payload as SuggestionEvent
        setSuggestions((prev) => (prev.some((p) => p.id === s.id) ? prev : [...prev.slice(-30), s]))
      })
      .subscribe((status) => setConnected(status === 'SUBSCRIBED'))

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [meetingId])

  // auto-scroll do feed
  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' })
  }, [finals, partial])

  async function toggleFloat() {
    const root = rootRef.current
    const home = homeRef.current
    if (!root || !home) return

    const dpp = (
      window as Window & {
        documentPictureInPicture?: {
          requestWindow: (o: { width: number; height: number }) => Promise<Window>
        }
      }
    ).documentPictureInPicture

    if (!dpp) {
      window.open(window.location.href, 'mc-float', 'width=440,height=760')
      return
    }

    const pip = await dpp.requestWindow({ width: 440, height: 720 })

    // copia os estilos da página para a janela flutuante
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const style = pip.document.createElement('style')
        style.textContent = Array.from(sheet.cssRules)
          .map((r) => r.cssText)
          .join('\n')
        pip.document.head.appendChild(style)
      } catch {
        if (sheet.href) {
          const link = pip.document.createElement('link')
          link.rel = 'stylesheet'
          link.href = sheet.href
          pip.document.head.appendChild(link)
        }
      }
    }
    pip.document.documentElement.className = document.documentElement.className
    pip.document.body.style.background = '#05080a'
    pip.document.body.appendChild(root)
    root.dataset.float = 'true'
    setFloating(true)

    pip.addEventListener('pagehide', () => {
      root.dataset.float = 'false'
      home.appendChild(root)
      setFloating(false)
    })
  }

  return (
    <div ref={homeRef}>
      <div ref={rootRef} className="war-root">
        <header className="war-header">
          <div>
            <p className="kicker">
              <span className={connected ? 'live-dot on' : 'live-dot'} /> {title}
            </p>
            <p className="mono muted" style={{ fontSize: '0.7rem', marginTop: '0.3rem' }}>
              {expertName ? `Copiloto: ${expertName}` : 'Copiloto'}
              {baseName ? ` · Base: ${baseName}` : ''} · {connected ? 'ao vivo' : initialStatus}
            </p>
          </div>
          <button className="btn btn-ghost btn-inline" style={{ padding: '0.4rem 0.9rem', fontSize: '0.8rem' }} onClick={toggleFloat}>
            {floating ? 'Voltar ao painel' : 'Janela flutuante'}
          </button>
        </header>

        <div className="war-grid">
          <section className="war-col">
            <p className="kicker" style={{ marginBottom: '0.7rem' }}>
              Transcrição
            </p>
            <div ref={feedRef} className="war-feed">
              {finals.length === 0 && !partial ? (
                <p className="muted" style={{ fontSize: '0.85rem' }}>
                  Aguardando alguém falar na reunião…
                </p>
              ) : null}
              {finals.map((seg, i) => (
                <p key={seg.seq ?? `f${i}`} className="war-line">
                  <span className="mono war-speaker">{seg.speaker}</span> {seg.text}
                </p>
              ))}
              {partial ? (
                <p className="war-line partial">
                  <span className="mono war-speaker">{partial.speaker}</span> {partial.text}
                </p>
              ) : null}
            </div>
          </section>

          <section className="war-col">
            <p className="kicker" style={{ marginBottom: '0.7rem' }}>
              Copiloto {expertName ? `· ${expertName}` : ''}
            </p>
            <div className="war-feed">
              {suggestions.length === 0 ? (
                <p className="muted" style={{ fontSize: '0.85rem' }}>
                  As sugestões do {expertName ?? 'copiloto'} aparecem aqui conforme a conversa avança
                  {baseName ? `, alimentadas pela base "${baseName}"` : ''}.
                </p>
              ) : (
                [...suggestions].reverse().map((s) => (
                  <div key={s.id} className="sug-card">
                    <span className="sug-kind">{KIND_LABEL[s.kind]}</span>
                    <p className="sug-content">{s.content}</p>
                    {s.rationale ? <p className="sug-why">{s.rationale}</p> : null}
                  </div>
                ))
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.8rem' }}>
              <button className="btn btn-ghost" disabled title="Chega na F6">
                Me ajuda agora
              </button>
              <button className="btn btn-primary" disabled title="Chega na F6">
                Gerar Proposta
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
