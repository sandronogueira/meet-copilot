import { NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { z } from 'zod'
import { adminEnv, webhookSecret } from '@/lib/env'
import { supabaseAdmin } from '@/lib/supabase-admin'

/** Webhooks de status do Recall.ai (assinados via Svix). */

const recallStatusEventSchema = z.looseObject({
  event: z.string(),
  data: z.looseObject({
    bot: z.looseObject({ id: z.string() }).optional(),
    data: z.looseObject({ code: z.string().optional() }).optional(),
  }),
})

/** Mapeia evento do Recall → status interno da meeting. */
function mapStatus(event: string, code?: string): string | null {
  if (event !== 'bot.status_change' && !event.startsWith('bot.')) return null
  const key = code ?? event.replace('bot.', '')
  switch (key) {
    case 'joining_call':
    case 'in_waiting_room':
      return 'joining'
    case 'in_call_recording':
    case 'in_call_not_recording':
      return 'in_call'
    case 'done':
    case 'call_ended':
      return 'processing' // dispara pipeline pós-reunião (F5: MeetingFacts + report)
    case 'fatal':
      return 'failed'
    default:
      return null
  }
}

export async function POST(req: Request) {
  const env = adminEnv()
  if (!env) {
    console.error('[webhook/recall] SUPABASE_SERVICE_ROLE_KEY ausente')
    return NextResponse.json({ ok: false, error: 'webhook não configurado' }, { status: 503 })
  }

  const payload = await req.text()

  // Verificação de assinatura (obrigatória em produção)
  const secret = webhookSecret()
  if (secret) {
    const wh = new Webhook(secret)
    const headers = {
      'svix-id': req.headers.get('svix-id') ?? '',
      'svix-timestamp': req.headers.get('svix-timestamp') ?? '',
      'svix-signature': req.headers.get('svix-signature') ?? '',
    }
    try {
      wh.verify(payload, headers)
    } catch {
      return NextResponse.json({ ok: false }, { status: 401 })
    }
  } else if (process.env.NODE_ENV === 'production') {
    console.error('[webhook/recall] RECALL_WEBHOOK_SECRET ausente em produção')
    return NextResponse.json({ ok: false, error: 'webhook não configurado' }, { status: 503 })
  }

  const parsed = recallStatusEventSchema.safeParse(JSON.parse(payload))
  if (!parsed.success) return NextResponse.json({ ok: true }) // evento desconhecido: 200 silencioso

  const botId = parsed.data.data.bot?.id
  const status = mapStatus(parsed.data.event, parsed.data.data.data?.code)
  if (!botId || !status) return NextResponse.json({ ok: true })

  const db = supabaseAdmin(env)
  const patch: Record<string, unknown> = { status }
  if (status === 'in_call') patch.started_at = new Date().toISOString()
  if (status === 'processing') patch.ended_at = new Date().toISOString()

  const { error } = await db.from('meetings').update(patch).eq('recall_bot_id', botId)
  if (error) console.error('[webhook/recall] update falhou:', error.message)

  // TODO(F5): status 'processing' → enfileirar job report_generate na tabela jobs
  return NextResponse.json({ ok: true })
}
