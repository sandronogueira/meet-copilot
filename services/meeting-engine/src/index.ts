import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import { jwtVerify } from 'jose'
import { loadConfig } from './config'
import { Persistence } from './lib/persistence'
import { SessionManager, type SessionClaims } from './session/SessionManager'
import { GroqWhisperProvider } from './stt/GroqWhisperProvider'
import type { STTProvider } from './stt/STTProvider'

const config = loadConfig()
const persistence = new Persistence(config)
const sessions = new SessionManager(persistence)
const wsSecret = new TextEncoder().encode(config.ENGINE_WS_SECRET)
const startedAt = Date.now()

const stt: STTProvider | null = config.GROQ_API_KEY
  ? new GroqWhisperProvider(config.GROQ_API_KEY)
  : null
if (!stt) console.warn('[config] GROQ_API_KEY ausente — /ingest desativado')

const MAX_CHUNK_BYTES = 4 * 1024 * 1024

async function verifyToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, wsSecret)
    if (typeof payload.meetingId !== 'string' || typeof payload.workspaceId !== 'string') return null
    return {
      meetingId: payload.meetingId,
      workspaceId: payload.workspaceId,
      selfLabel: typeof payload.selfLabel === 'string' ? payload.selfLabel : undefined,
    }
  } catch {
    return null
  }
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json',
    // chamado por extensão Chrome (origem chrome-extension://) — CORS liberado
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
  })
  res.end(JSON.stringify(body))
}

/**
 * POST /ingest?token=<JWT>&track=mic|tab&startedMs=<n>
 * Body: chunk de áudio (webm/opus ~15s) capturado pela extensão.
 * mic = o usuário (selfLabel) · tab = os demais participantes (prospect).
 */
async function handleIngest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!stt) {
    json(res, 503, { ok: false, error: { code: 'STT_OFF', message: 'GROQ_API_KEY não configurada' } })
    return
  }

  const url = new URL(req.url ?? '/', 'http://localhost')
  const claims = await verifyToken(url.searchParams.get('token') ?? '')
  if (!claims) {
    json(res, 403, { ok: false, error: { code: 'TOKEN', message: 'token inválido' } })
    return
  }

  const track = url.searchParams.get('track') === 'mic' ? 'mic' : 'tab'
  const startedMs = Number(url.searchParams.get('startedMs')) || 0

  const parts: Buffer[] = []
  let size = 0
  for await (const part of req) {
    size += (part as Buffer).length
    if (size > MAX_CHUNK_BYTES) {
      json(res, 413, { ok: false, error: { code: 'TOO_BIG', message: 'chunk acima de 4MB' } })
      return
    }
    parts.push(part as Buffer)
  }
  const audio = Buffer.concat(parts)
  if (audio.length < 1000) {
    json(res, 200, { ok: true, data: { skipped: 'chunk vazio' } })
    return
  }

  const mime = req.headers['content-type'] ?? 'audio/webm'
  const result = await stt.transcribeChunk(audio, mime, 'pt')
  if (!result.ok) {
    console.error(`[ingest ${claims.meetingId}] STT falhou:`, result.error)
    json(res, 502, result)
    return
  }

  const text = result.data.text
  if (text.length === 0) {
    json(res, 200, { ok: true, data: { skipped: 'sem fala no chunk' } })
    return
  }

  const session = sessions.open(claims)
  await session.ingestSegment({
    speakerLabel: track === 'mic' ? (claims.selfLabel ?? 'Você') : 'Participante',
    text,
    startedMs,
    endedMs: startedMs + 15_000,
    isFinal: true,
  })

  json(res, 200, { ok: true, data: { text } })
}

const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(
      JSON.stringify({
        ok: true,
        uptimeS: Math.round((Date.now() - startedAt) / 1000),
        sessions: sessions.count,
        supabase: Boolean(config.SUPABASE_URL),
        stt: stt?.name ?? null,
      }),
    )
    return
  }
  if (req.url?.startsWith('/ingest')) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
      })
      res.end()
      return
    }
    if (req.method === 'POST') {
      void handleIngest(req, res).catch((e: unknown) => {
        console.error('[ingest] erro não tratado:', e)
        if (!res.headersSent) json(res, 500, { ok: false })
      })
      return
    }
  }
  res.writeHead(404).end()
})

const wss = new WebSocketServer({ noServer: true })

/**
 * Upgrade em /stream?token=<JWT> — token curto assinado pelo apps/web na
 * criação do bot (HS256, claims: meetingId, workspaceId, selfLabel).
 */
server.on('upgrade', (req, socket, head) => {
  void (async () => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname !== '/stream') {
      socket.destroy()
      return
    }
    const token = url.searchParams.get('token')
    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }

    let claims: SessionClaims
    try {
      const { payload } = await jwtVerify(token, wsSecret)
      if (typeof payload.meetingId !== 'string' || typeof payload.workspaceId !== 'string') {
        throw new Error('claims incompletas')
      }
      claims = {
        meetingId: payload.meetingId,
        workspaceId: payload.workspaceId,
        selfLabel: typeof payload.selfLabel === 'string' ? payload.selfLabel : undefined,
      }
    } catch {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
      socket.destroy()
      return
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      attachSession(ws, claims)
    })
  })()
})

function attachSession(ws: WebSocket, claims: SessionClaims): void {
  const session = sessions.open(claims)

  ws.on('message', (data) => {
    void session.handleRawMessage(data.toString()).catch((e: unknown) => {
      // fail-soft: nenhum frame derruba a sessão
      console.error(`[ws ${claims.meetingId}] erro ao processar frame:`, e)
    })
  })

  ws.on('close', () => {
    // Recall pode reconectar — a sessão persiste até o webhook de fim (bot done)
    console.log(`[ws ${claims.meetingId}] desconectado (sessão mantida para reconexão)`)
  })
}

server.listen(config.PORT, () => {
  console.log(`meeting-engine ouvindo em :${config.PORT} (WSS em /stream, health em /health)`)
})

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    console.log(`recebido ${sig}, encerrando...`)
    server.close(() => process.exit(0))
  })
}
