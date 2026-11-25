import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'

/**
 * Cifra das chaves de IA dos clientes (coluna workspace_llm_keys.key_ciphertext).
 *
 * - AES-256-GCM. A chave de cifra é DERIVADA (HKDF) do segredo que o site e o
 *   motor já compartilham (ENGINE_WS_SECRET): não há segredo novo para configurar.
 * - O id do workspace entra como dado autenticado. Um texto cifrado copiado para
 *   a linha de outro workspace não abre.
 * - Formato: v1.<iv>.<tag>.<dados>, tudo em base64url.
 * - Trocar o ENGINE_WS_SECRET invalida as chaves guardadas (o cliente cola de novo).
 *
 * ATENÇÃO: este arquivo existe IGUAL em apps/web/src/lib e em
 * services/meeting-engine/src/lib (o site cifra, o motor abre). Mudou um, mude o
 * outro: o teste llm-key-crypto.test.ts falha se os dois ficarem diferentes.
 */

const VERSION = 'v1'
const INFO = 'meet-copilot:workspace-llm-keys:v1'

function deriveKey(secret: string): Buffer {
  if (secret.length < 32) throw new Error('segredo curto demais para derivar a chave de cifra')
  return Buffer.from(hkdfSync('sha256', secret, 'meet-copilot', INFO, 32))
}

/** Cifra a chave de IA para guardar no banco. */
export function encryptLlmKey(plain: string, workspaceId: string, secret: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret), iv)
  cipher.setAAD(Buffer.from(workspaceId))
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return [
    VERSION,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    data.toString('base64url'),
  ].join('.')
}

/** Abre a chave. Devolve null se não abrir (formato, segredo ou workspace errados). Nunca lança. */
export function decryptLlmKey(payload: string, workspaceId: string, secret: string): string | null {
  try {
    const [version, iv, tag, data] = payload.split('.')
    if (version !== VERSION || !iv || !tag || !data) return null
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret), Buffer.from(iv, 'base64url'))
    decipher.setAAD(Buffer.from(workspaceId))
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

/** Formato de chave da Anthropic. Não prova que funciona, só evita colagem errada. */
export function isAnthropicKeyFormat(key: string): boolean {
  return /^sk-ant-[A-Za-z0-9_-]{20,300}$/.test(key)
}

/** Últimos 4 caracteres: bastam para o dono reconhecer a chave e não servem para usá-la. */
export function llmKeyHint(key: string): string {
  return key.slice(-4)
}
