/**
 * Quando a IA responde com erro usando a chave do CLIENTE, este arquivo decide se
 * o problema é da chave (recusada ou sem crédito) ou é passageiro.
 *
 * Só no primeiro caso o motor marca a chave como inválida e refaz a chamada com a
 * chave da plataforma. Erro de rede, limite de requisições ou sobrecarga não
 * condenam a chave de ninguém.
 */

export interface LlmErrorLike {
  code: string
  message: string
  details?: unknown
}

function statusOf(error: LlmErrorLike): number | null {
  const details = error.details
  if (details && typeof details === 'object' && typeof (details as { status?: unknown }).status === 'number') {
    return (details as { status: number }).status
  }
  const match = /HTTP (\d{3})/.exec(error.message)
  return match ? Number(match[1]) : null
}

function bodyOf(error: LlmErrorLike): string {
  const details = error.details
  if (typeof details === 'string') return details
  if (details && typeof details === 'object' && typeof (details as { body?: unknown }).body === 'string') {
    return (details as { body: string }).body
  }
  return ''
}

/**
 * Motivo, em linguagem de usuário, pelo qual a chave do cliente não serve.
 * null = o erro não é culpa da chave.
 */
export function keyRejectionReason(error: LlmErrorLike): string | null {
  // só erros HTTP vindos do provedor contam (ANTHROPIC = cliente direto, LLM_HTTP = roteador)
  if (error.code !== 'ANTHROPIC' && error.code !== 'LLM_HTTP') return null
  const status = statusOf(error)
  if (status === 401 || status === 403) return 'A Anthropic recusou a chave (inválida ou revogada).'
  if (status === 400 && /credit balance|billing/i.test(bodyOf(error))) {
    return 'A conta da Anthropic está sem crédito.'
  }
  return null
}
