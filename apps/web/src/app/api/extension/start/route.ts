import { NextResponse } from 'next/server'
import { SignJWT } from 'jose'
import { z } from 'zod'
import { err } from '@meet-copilot/shared'
import { supabaseServer } from '@/lib/supabase/server'

const startSchema = z.object({
  meetingUrl: z.url(),
  contextBaseId: z.uuid().optional(),
  meetingProfileId: z.uuid().optional(),
})

const engineEnvSchema = z.object({
  ENGINE_WS_URL: z.string().min(1),
  ENGINE_WS_SECRET: z.string().min(32),
})

/**
 * POST /api/extension/start — chamado pelo SIDE PANEL da extensão.
 * A extensão envia cookies do domínio (host_permissions) → sessão Supabase
 * normal + RLS. Cria a reunião (capture_mode=extension) e devolve os tokens
 * de ingestão (engine) e do iframe do painel.
 */
export async function POST(req: Request) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json(err('UNAUTHORIZED', 'Faça login em meet.2020agency.co'), {
      status: 401,
    })
  }

  const body: unknown = await req.json().catch(() => null)
  const parsed = startSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(err('VALIDATION', 'payload inválido'), { status: 400 })
  }
  if (!parsed.data.meetingUrl.includes('meet.google.com')) {
    return NextResponse.json(err('PLATFORM', 'MVP da extensão: Google Meet primeiro'), {
      status: 400,
    })
  }

  const engineEnv = engineEnvSchema.safeParse(process.env)
  if (!engineEnv.success) {
    return NextResponse.json(err('ENGINE_OFF', 'meeting-engine não configurado neste ambiente'), {
      status: 503,
    })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_workspace_id, self_label, full_name')
    .eq('user_id', user.id)
    .single()
  const workspaceId = profile?.default_workspace_id as string | null
  if (!workspaceId) return NextResponse.json(err('NO_WORKSPACE', 'workspace não encontrado'), { status: 400 })

  // base: explícita > default do workspace
  let baseId = parsed.data.contextBaseId ?? null
  let baseName: string | null = null
  if (baseId) {
    const { data } = await supabase.from('context_bases').select('id, name').eq('id', baseId).single()
    if (!data) return NextResponse.json(err('CONTEXT_BASE', 'base não encontrada'), { status: 400 })
    baseName = data.name
  } else {
    const { data } = await supabase
      .from('context_bases')
      .select('id, name')
      .eq('workspace_id', workspaceId)
      .eq('is_default', true)
      .single()
    baseId = data?.id ?? null
    baseName = data?.name ?? null
  }

  const { data: ws } = await supabase.from('workspaces').select('settings').eq('id', workspaceId).single()
  const wsSettings = (ws?.settings ?? {}) as { default_expert_id?: string }
  const { data: expert } = wsSettings.default_expert_id
    ? await supabase.from('sales_experts').select('name').eq('id', wsSettings.default_expert_id).single()
    : { data: null }

  const title = `${baseName ?? 'Reunião'} — ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Fortaleza' })}`

  const { data: meeting, error: insertError } = await supabase
    .from('meetings')
    .insert({
      workspace_id: workspaceId,
      created_by: user.id,
      title,
      platform: 'meet',
      meeting_url: parsed.data.meetingUrl,
      status: 'in_call',
      capture_mode: 'extension',
      meeting_profile_id: parsed.data.meetingProfileId ?? null,
      settings: { context_base_id: baseId },
      consent: { mode: 'extension', note: 'captura local pela extensão do usuário' },
    })
    .select('id')
    .single()
  if (insertError || !meeting) {
    return NextResponse.json(err('DB', insertError?.message ?? 'insert falhou'), { status: 500 })
  }

  const secret = new TextEncoder().encode(engineEnv.data.ENGINE_WS_SECRET)
  const selfLabel = profile?.self_label ?? profile?.full_name ?? 'Você'

  const ingestToken = await new SignJWT({ meetingId: meeting.id, workspaceId, selfLabel })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('12h')
    .sign(secret)

  // panel token carrega os metadados do cabeçalho — o iframe não precisa de banco
  const panelToken = await new SignJWT({
    meetingId: meeting.id,
    title,
    baseName,
    expertName: expert?.name ?? null,
    scope: 'panel',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('12h')
    .sign(secret)

  const ingestUrl =
    engineEnv.data.ENGINE_WS_URL.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/stream$/, '/ingest')

  const origin = new URL(req.url).origin

  return NextResponse.json({
    ok: true,
    data: {
      meetingId: meeting.id,
      ingestUrl,
      ingestToken,
      panelUrl: `${origin}/panel/${meeting.id}?ptoken=${panelToken}`,
    },
  })
}
