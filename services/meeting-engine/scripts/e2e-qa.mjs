// QA E2E — injeta transcrição sintética no engine de PRODUÇÃO via WSS /stream
// e verifica se o pipeline (trigger → router → gerador → broadcast) responde.
// Uso: node e2e-qa.mjs <meetingId> <workspaceId> <secret>
import { SignJWT } from 'jose'
import WebSocket from 'ws'

const [meetingId, workspaceId, secret] = process.argv.slice(2)
// ENGINE_WS=ws://localhost:8123/stream para testar um engine local
const WS_URL = process.env.ENGINE_WS ?? 'wss://agencia2020-meet-copilot-engine.ocgogh.easypanel.host/stream'

const token = await new SignJWT({ meetingId, workspaceId, selfLabel: 'QA Vendedor' })
  .setProtectedHeader({ alg: 'HS256' })
  .setExpirationTime('1h')
  .sign(new TextEncoder().encode(secret))

const ws = new WebSocket(`${WS_URL}?token=${token}`)

function recallEvent(speaker, text, startS) {
  const words = text.split(' ').map((w, i) => ({
    text: w,
    start_timestamp: { relative: startS + i * 0.3 },
    end_timestamp: { relative: startS + i * 0.3 + 0.25 },
  }))
  return JSON.stringify({
    event: 'transcript.data',
    data: { data: { words, participant: { id: 1, name: speaker } } },
  })
}

const FALAS = [
  ['QA Vendedor', 'Boa tarde Ricardo, obrigado por topar essa conversa, me conta um pouco de como está a operação comercial de vocês hoje', 0],
  ['Ricardo Prospect', 'Olha vou ser sincero nosso maior problema é o custo de captação de clientes que não para de subir a gente investe quase quarenta mil reais por mês em anúncios e o time comercial não dá conta de fazer follow-up então boa parte dos leads esfria e a concorrência pega e eu sinto que estamos perdendo dinheiro todo santo mês sem conseguir medir direito o retorno', 12],
  ['Ricardo Prospect', 'E outra coisa que me incomoda é que já testamos duas agências antes e nenhuma entregou o que prometeu então para fechar com vocês eu preciso de garantias muito claras de resultado senão não consigo aprovar esse orçamento com o meu sócio', 45],
]

ws.on('open', async () => {
  console.log('[e2e] conectado ao /stream de produção')
  for (const [speaker, text, t] of FALAS) {
    ws.send(recallEvent(speaker, text, t))
    console.log(`[e2e] enviado: ${speaker} (${text.split(' ').length} palavras)`)
    await new Promise((r) => setTimeout(r, 2500))
  }
  console.log('[e2e] aguardando o pipeline (T1 turno + T2 timer)…')
  setTimeout(() => {
    console.log('[e2e] fim da janela de espera')
    ws.close()
    process.exit(0)
  }, 40_000)
})

ws.on('unexpected-response', (_req, res) => {
  console.error(`[e2e] REJEITADO: HTTP ${res.statusCode} (secret divergente?)`)
  process.exit(1)
})
ws.on('error', (e) => {
  console.error('[e2e] erro ws:', e.message)
  process.exit(1)
})
