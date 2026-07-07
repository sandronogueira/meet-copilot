import { redirect, notFound } from 'next/navigation'
import { SignJWT } from 'jose'
import { supabaseServer } from '@/lib/supabase/server'
import { WarRoom } from './war-room'

function engineHttpUrl(): string | null {
  const ws = process.env.ENGINE_WS_URL
  if (!ws) return null
  return ws.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/stream$/, '')
}

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meeting } = await supabase
    .from('meetings')
    .select('id, title, status, platform, settings, workspace_id, meeting_url')
    .eq('id', id)
    .single()
  if (!meeting) notFound()

  const meetingCode = meeting.meeting_url
    ? meeting.meeting_url.replace(/^https?:\/\//, '').split('?')[0]!.split('/').filter(Boolean).pop() ?? null
    : null

  const settings = (meeting.settings ?? {}) as { context_base_id?: string }

  const [{ data: base }, { data: workspace }] = await Promise.all([
    settings.context_base_id
      ? supabase.from('context_bases').select('name').eq('id', settings.context_base_id).single()
      : Promise.resolve({ data: null }),
    supabase.from('workspaces').select('settings').eq('id', meeting.workspace_id).single(),
  ])

  const wsSettings = (workspace?.settings ?? {}) as { default_expert_id?: string }
  const { data: expert } = wsSettings.default_expert_id
    ? await supabase
        .from('sales_experts')
        .select('name')
        .eq('id', wsSettings.default_expert_id)
        .single()
    : { data: null }

  // Token de controle (relatório/proposta) — mesmo secret do engine
  let controlToken: string | null = null
  const secret = process.env.ENGINE_WS_SECRET
  if (secret) {
    controlToken = await new SignJWT({ meetingId: meeting.id, workspaceId: meeting.workspace_id })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('12h')
      .sign(new TextEncoder().encode(secret))
  }

  return (
    <WarRoom
      meetingId={meeting.id}
      title={meeting.title ?? 'Reunião ao vivo'}
      meetingCode={meetingCode}
      initialStatus={meeting.status}
      baseName={base?.name ?? null}
      expertName={expert?.name ?? null}
      variant="session"
      engineUrl={engineHttpUrl()}
      controlToken={controlToken}
    />
  )
}
