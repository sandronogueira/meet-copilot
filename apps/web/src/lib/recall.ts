import { ok, err, type ModuleOutput } from '@meet-copilot/shared'
import type { RecallEnv } from './env'

export interface CreateBotParams {
  meetingUrl: string
  botName: string
  /** URL do WS do meeting-engine já com ?token= assinado */
  realtimeWsUrl: string
  language?: string
}

export interface RecallBot {
  id: string
}

/**
 * Cliente mínimo do Recall.ai Meeting Bot API.
 * Docs: https://docs.recall.ai — POST /api/v1/bot
 */
export async function createRecallBot(
  env: RecallEnv,
  params: CreateBotParams,
): Promise<ModuleOutput<RecallBot>> {
  const res = await fetch(`${env.RECALL_API_BASE}/api/v1/bot`, {
    method: 'POST',
    headers: {
      authorization: env.RECALL_API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      meeting_url: params.meetingUrl,
      bot_name: params.botName,
      recording_config: {
        transcript: {
          // Transcrição nativa do Recall (US$0,15/h, sem credencial extra).
          // Deepgram BYO exige key cadastrada no dashboard do Recall — fica
          // como upgrade de qualidade PT-BR se o piloto pedir.
          provider: {
            recallai_streaming: {
              // 'prioritize_low_latency' só suporta inglês — PT exige accuracy
              mode: 'prioritize_accuracy',
              language_code: params.language ?? 'pt',
            },
          },
          diarization: { use_separate_streams_when_available: true },
        },
        realtime_endpoints: [
          {
            type: 'websocket',
            url: params.realtimeWsUrl,
            events: ['transcript.data', 'transcript.partial_data'],
          },
        ],
      },
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return err('RECALL_CREATE_BOT', `Recall respondeu ${res.status}`, body.slice(0, 500))
  }

  const json = (await res.json()) as { id?: string }
  if (!json.id) return err('RECALL_CREATE_BOT', 'resposta sem id do bot', json)
  return ok({ id: json.id })
}
