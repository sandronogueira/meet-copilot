import { test } from 'node:test'
import assert from 'node:assert/strict'
import { keyRejectionReason } from './client-llm-key'

// Rodar: `bun run test` (raiz do monorepo).

test('chave recusada pela Anthropic (401/403) condena a chave', () => {
  // formato do cliente direto (sugestões ao vivo)
  assert.match(keyRejectionReason({ code: 'ANTHROPIC', message: 'HTTP 401', details: '{"error":"invalid x-api-key"}' })!, /recusou/)
  // formato do roteador (relatório e proposta)
  assert.match(keyRejectionReason({ code: 'LLM_HTTP', message: 'HTTP 403', details: { status: 403, body: 'forbidden' } })!, /recusou/)
})

test('conta sem crédito condena a chave', () => {
  const body = '{"type":"error","error":{"message":"Your credit balance is too low to access the Anthropic API."}}'
  assert.match(keyRejectionReason({ code: 'ANTHROPIC', message: 'HTTP 400', details: body })!, /sem crédito/)
  assert.match(keyRejectionReason({ code: 'LLM_HTTP', message: 'HTTP 400', details: { status: 400, body } })!, /sem crédito/)
})

test('erro passageiro NÃO condena a chave', () => {
  assert.equal(keyRejectionReason({ code: 'ANTHROPIC', message: 'HTTP 429', details: 'rate limit' }), null)
  assert.equal(keyRejectionReason({ code: 'ANTHROPIC', message: 'HTTP 529', details: 'overloaded' }), null)
  assert.equal(keyRejectionReason({ code: 'LLM_HTTP', message: 'HTTP 500', details: { status: 500, body: '' } }), null)
  assert.equal(keyRejectionReason({ code: 'ANTHROPIC_NET', message: 'timeout' }), null)
  assert.equal(keyRejectionReason({ code: 'LLM_NET', message: 'falha de rede/timeout' }), null)
})

test('400 que não é de cobrança (pedido malformado) não condena a chave', () => {
  assert.equal(keyRejectionReason({ code: 'ANTHROPIC', message: 'HTTP 400', details: '{"error":"max_tokens: field required"}' }), null)
})

test('erros que não vêm do provedor são ignorados', () => {
  assert.equal(keyRejectionReason({ code: 'REPORT_SCHEMA', message: 'HTTP 401 dentro de um texto qualquer' }), null)
  assert.equal(keyRejectionReason({ code: 'LLM_NO_KEY', message: 'API key ausente para provider anthropic' }), null)
})
