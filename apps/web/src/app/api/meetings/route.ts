import { NextResponse } from 'next/server'
import { SignJWT } from 'jose'
import { z } from 'zod'
import { err } from '@meet-copilot/shared'
import { recallEnv } from '@/lib/env'
import { supabaseServer } from '@/lib/supabase/server'
import { createRecallBot } from '@/lib/recall'

const createMeetingSchema = z.object({
  meetingUrl: z.url('URL inválida'),
  title: z.string().max(200).optional(),
  contextBaseId: z.uuid().optional(),
})

function detectPlatform(url: string): 'meet' | 'zoom' | 'teams' | null {
  if (url.includes('meet.google.com')) return 'meet'
  if (url.includes('zoom.us')) return 'zoom'
  if (url.includes('teams.microsoft.com') || url.includes('teams.live.com')) return 'teams'
  return null
}

/** POST /api/meetings — cria a reunião (RLS do usuário logado) e manda o bot entrar. */
export async function POST(req: Request) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json(err('UNAUTHORIZED', 'Sessão expirada — faça login'), { status: 401 })
  }

  const body: unknown = await req.json().catch(() => null)
  const parsed = createMeetingSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      err('VALIDATION', parsed.error.issues[0]?.message ?? 'payload inválido'),
      { status: 400 },
    )
  }

  const platform = detectPlatform(parsed.data.meetingUrl)
  if (!platform) {
    return NextResponse.json(err('PLATFORM', 'Cole um link de Meet, Zoom ou Teams'), {
      status: 400,
    })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_workspace_id')
    .eq('user_id', user.id)
    .single()
  const workspaceId = profile?.default_workspace_id as string | null
  if (!workspaceId) {
    return NextResponse.json(err('NO_WORKSPACE', 'Workspace não encontrado'), { status: 400 })
  }

  // Base de conhecimento da reunião: valida que pertence ao workspace (via RLS)
  let contextBaseId = parsed.data.contextBaseId ?? null
  if (contextBaseId) {
    const { data: base } = await supabase
      .from('context_bases')
      .select('id')
      .eq('id', contextBaseId)
      .eq('workspace_id', workspaceId)
      .single()
    if (!base) {
      return NextResponse.json(err('CONTEXT_BASE', 'Base de conhecimento não encontrada'), {
        status: 400,
      })
    }
    contextBaseId = base.id
  }

  const env = recallEnv()
  if (!env) {
    return NextResponse.json(
      err(
        'RECALL_NOT_CONFIGURED',
        'O bot de reunião ainda não está ativo: falta a chave da Recall.ai no servidor (RECALL_API_KEY). Configure e tente de novo.',
      ),
      { status: 503 },
    )
  }

  // Consentimento LGPD: nome do bot SEMPRE anuncia gravação (white-label por workspace)
  const { data: ws } = await supabase
    .from('workspaces')
    .select('settings')
    .eq('id', workspaceId)
    .single()
  const settings = (ws?.settings ?? {}) as { bot_name?: string }
  const botName = settings.bot_name ?? 'Meet Copilot — Assistente IA (gravando)'

  const { data: meeting, error: insertError } = await supabase
    .from('meetings')
    .insert({
      workspace_id: workspaceId,
      created_by: user.id,
      title: parsed.data.title ?? null,
      platform,
      meeting_url: parsed.data.meetingUrl,
      status: 'created',
      capture_mode: 'bot',
      consent: { bot_name: botName },
      settings: { context_base_id: contextBaseId },
    })
    .select('id')
    .single()

  if (insertError || !meeting) {
    return NextResponse.json(err('DB', insertError?.message ?? 'insert falhou'), { status: 500 })
  }

  // Token curto para o WS do meeting-engine (mesmo segredo dos dois lados)
  const token = await new SignJWT({ meetingId: meeting.id, workspaceId })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('12h')
    .sign(new TextEncoder().encode(env.ENGINE_WS_SECRET))

  const bot = await createRecallBot(env, {
    meetingUrl: parsed.data.meetingUrl,
    botName,
    realtimeWsUrl: `${env.ENGINE_WS_URL}?token=${token}`,
  })

  if (!bot.ok) {
    await supabase.from('meetings').update({ status: 'failed' }).eq('id', meeting.id)
    return NextResponse.json(bot, { status: 502 })
  }

  await supabase
    .from('meetings')
    .update({ recall_bot_id: bot.data.id, status: 'joining' })
    .eq('id', meeting.id)

  return NextResponse.json({ ok: true, data: { meetingId: meeting.id, botId: bot.data.id } })
}
