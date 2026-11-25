import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { decryptLlmKey, encryptLlmKey, isAnthropicKeyFormat, llmKeyHint } from './llm-key-crypto'
import * as webCopy from '../../../../apps/web/src/lib/llm-key-crypto'

// Rodar: `bun run test` (raiz do monorepo). Nenhuma chave real aparece aqui.
const SECRET = 'a'.repeat(64)
const WS = '11111111-1111-4111-8111-111111111111'
const OTHER_WS = '22222222-2222-4222-8222-222222222222'
const FAKE_KEY = 'sk-ant-api03-chave-de-mentira-para-teste-0123456789abcdEFGH'

test('cifra e abre a mesma chave', () => {
  const sealed = encryptLlmKey(FAKE_KEY, WS, SECRET)
  assert.match(sealed, /^v1\.[\w-]+\.[\w-]+\.[\w-]+$/)
  assert.doesNotMatch(sealed, /sk-ant/)
  assert.equal(decryptLlmKey(sealed, WS, SECRET), FAKE_KEY)
})

test('cada cifragem sai diferente (iv aleatório), mas todas abrem', () => {
  const a = encryptLlmKey(FAKE_KEY, WS, SECRET)
  const b = encryptLlmKey(FAKE_KEY, WS, SECRET)
  assert.notEqual(a, b)
  assert.equal(decryptLlmKey(b, WS, SECRET), FAKE_KEY)
})

test('texto cifrado copiado para outro workspace não abre', () => {
  const sealed = encryptLlmKey(FAKE_KEY, WS, SECRET)
  assert.equal(decryptLlmKey(sealed, OTHER_WS, SECRET), null)
})

test('segredo errado, texto adulterado ou lixo devolvem null sem lançar', () => {
  const sealed = encryptLlmKey(FAKE_KEY, WS, SECRET)
  assert.equal(decryptLlmKey(sealed, WS, 'b'.repeat(64)), null)
  const parts = sealed.split('.')
  parts[3] = parts[3]!.slice(0, -2) + (parts[3]!.endsWith('AA') ? 'BB' : 'AA')
  assert.equal(decryptLlmKey(parts.join('.'), WS, SECRET), null)
  assert.equal(decryptLlmKey('v2.x.y.z', WS, SECRET), null)
  assert.equal(decryptLlmKey('qualquer coisa', WS, SECRET), null)
  assert.equal(decryptLlmKey('', WS, SECRET), null)
})

test('segredo curto é recusado na cifragem', () => {
  assert.throws(() => encryptLlmKey(FAKE_KEY, WS, 'curto'))
})

test('o site cifra e o motor abre (as duas cópias conversam)', () => {
  assert.equal(decryptLlmKey(webCopy.encryptLlmKey(FAKE_KEY, WS, SECRET), WS, SECRET), FAKE_KEY)
  assert.equal(webCopy.decryptLlmKey(encryptLlmKey(FAKE_KEY, WS, SECRET), WS, SECRET), FAKE_KEY)
})

test('as duas cópias do arquivo de cifra são idênticas', () => {
  const engine = readFileSync(new URL('./llm-key-crypto.ts', import.meta.url), 'utf8')
  const web = readFileSync(new URL('../../../../apps/web/src/lib/llm-key-crypto.ts', import.meta.url), 'utf8')
  assert.equal(engine, web)
})

test('formato de chave da Anthropic e os 4 últimos caracteres', () => {
  assert.equal(isAnthropicKeyFormat(FAKE_KEY), true)
  assert.equal(isAnthropicKeyFormat('sk-proj-chave-de-outro-provedor-0123456789'), false)
  assert.equal(isAnthropicKeyFormat('sk-ant-curta'), false)
  assert.equal(isAnthropicKeyFormat(`${FAKE_KEY} `), false)
  assert.equal(isAnthropicKeyFormat(''), false)
  assert.equal(llmKeyHint(FAKE_KEY), 'EFGH')
})
