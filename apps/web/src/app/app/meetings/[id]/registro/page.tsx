import { redirect, notFound } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import { RegistroView, type RegistroData } from './registro-view'

export const dynamic = 'force-dynamic'

/**
 * Registro da sessão: tudo que a reunião produziu, num lugar só —
 * transcrição completa, relatório (editável), proposta publicada.
 */
export default async function RegistroPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meeting } = await supabase
    .from('meetings')
    .select('id, title, status, created_at, meeting_url, settings')
    .eq('id', id)
    .single()
  if (!meeting) notFound()

  const settings = (meeting.settings ?? {}) as { context_base_id?: string }

  const [{ data: segments }, { data: report }, { data: proposals }, { data: base }] =
    await Promise.all([
      supabase
        .from('transcript_segments')
        .select('seq, speaker_label, text')
        .eq('meeting_id', id)
        .order('seq')
        .limit(2000),
      supabase
        .from('reports')
        .select('summary, decisions, action_items, red_flags, objections, next_steps')
        .eq('meeting_id', id)
        .maybeSingle(),
      supabase
        .from('proposals')
        .select('slug, title, created_at')
        .eq('meeting_id', id)
        .order('created_at', { ascending: false }),
      settings.context_base_id
        ? supabase.from('context_bases').select('name').eq('id', settings.context_base_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

  const data: RegistroData = {
    meetingId: meeting.id as string,
    title: (meeting.title as string | null) ?? 'Reunião sem título',
    status: meeting.status as string,
    createdAt: meeting.created_at as string,
    baseName: (base as { name?: string } | null)?.name ?? null,
    segments: (segments ?? []) as RegistroData['segments'],
    report: (report ?? null) as RegistroData['report'],
    proposals: (proposals ?? []) as RegistroData['proposals'],
  }

  return <RegistroView data={data} />
}
