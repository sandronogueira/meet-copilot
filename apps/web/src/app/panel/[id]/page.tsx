import { jwtVerify } from 'jose'
import { WarRoom } from '@/app/app/meetings/[id]/war-room'

export const dynamic = 'force-dynamic'

/**
 * Versão do war room para o SIDE PANEL da extensão (carregada em iframe).
 * Sem cookies: autentica pelo ptoken (JWT com os metadados embutidos) e
 * acompanha a reunião via Realtime Broadcast (anon key).
 */
export default async function PanelPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ ptoken?: string }>
}) {
  const { id } = await params
  const { ptoken } = await searchParams

  const secret = process.env.ENGINE_WS_SECRET
  if (!ptoken || !secret) return <PanelError msg="Token ausente" />

  let payload: { meetingId?: string; title?: string; baseName?: string | null; expertName?: string | null; scope?: string }
  try {
    const verified = await jwtVerify(ptoken, new TextEncoder().encode(secret))
    payload = verified.payload as typeof payload
  } catch {
    return <PanelError msg="Sessão do painel expirou — reinicie o copiloto pela extensão" />
  }

  if (payload.scope !== 'panel' || payload.meetingId !== id) {
    return <PanelError msg="Token não corresponde a esta reunião" />
  }

  const ws = process.env.ENGINE_WS_URL
  const engineUrl = ws
    ? ws.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/stream$/, '')
    : null

  return (
    <WarRoom
      meetingId={id}
      title={payload.title ?? 'Reunião ao vivo'}
      initialStatus="in_call"
      baseName={payload.baseName ?? null}
      expertName={payload.expertName ?? null}
      variant="panel"
      engineUrl={engineUrl}
      controlToken={ptoken}
    />
  )
}

function PanelError({ msg }: { msg: string }) {
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh', padding: '2rem' }}>
      <p className="muted" style={{ textAlign: 'center' }}>
        {msg}
      </p>
    </div>
  )
}
