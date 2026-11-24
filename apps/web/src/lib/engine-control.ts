import { SignJWT } from 'jose'

/**
 * Acesso de CONTROLE ao meeting-engine (relatório, proposta, troca de clone)
 * a partir das páginas do app — usado pelo painel da reunião e pelo registro.
 * Só roda no servidor: o secret nunca vai para o navegador, só o token assinado.
 */

/** URL http(s) do engine, derivada da URL do WebSocket (wss://…/stream). */
export function engineHttpUrl(): string | null {
  const ws = process.env.ENGINE_WS_URL
  if (!ws) return null
  return ws.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/stream$/, '')
}

/**
 * Token de controle da reunião — mesmo secret do engine, válido por 12h.
 * Quem chama deve ter confirmado antes (via RLS) que a reunião é do usuário.
 */
export async function signControlToken(meetingId: string, workspaceId: string): Promise<string | null> {
  const secret = process.env.ENGINE_WS_SECRET
  if (!secret) return null
  return new SignJWT({ meetingId, workspaceId })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('12h')
    .sign(new TextEncoder().encode(secret))
}
