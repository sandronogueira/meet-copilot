import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * Chave de IA do cliente: teste da chave e leitura do estado para a tela.
 * SOMENTE servidor (usa service_role). A tabela workspace_llm_keys não tem
 * policy de cliente; daqui só saem metadados, nunca a chave nem o texto cifrado.
 */

/** Mesmo modelo que o motor usa no roteador ao vivo: o teste prova acesso ao que será usado. */
const TEST_MODEL = 'claude-haiku-4-5-20251001'

export type KeyTestResult = { ok: true } | { ok: false; error: string }

/**
 * Testa a chave com uma chamada real de 1 token (fração de centavo na conta do
 * cliente). Só assim dá para saber se a chave é aceita E se a conta tem crédito.
 */
export async function testAnthropicKey(apiKey: string): Promise<KeyTestResult> {
  let res: Response
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: TEST_MODEL, max_tokens: 1, messages: [{ role: 'user', content: 'ok' }] }),
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    return { ok: false, error: 'Não conseguimos falar com a Anthropic agora. Tente de novo em instantes.' }
  }

  if (res.ok) {
    await res.body?.cancel().catch(() => undefined)
    return { ok: true }
  }

  const body = await res.text().catch(() => '')
  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: 'A Anthropic não reconheceu essa chave. Confira se copiou a chave inteira.' }
  }
  if (res.status === 400 && /credit balance|billing/i.test(body)) {
    return {
      ok: false,
      error: 'A chave é válida, mas a conta da Anthropic está sem crédito. Coloque crédito e tente de novo.',
    }
  }
  if (res.status === 404) {
    return { ok: false, error: 'Essa conta da Anthropic não tem acesso ao modelo usado pelo copiloto.' }
  }
  if (res.status === 429) {
    return { ok: false, error: 'A Anthropic limitou o teste agora. Tente de novo em um minuto.' }
  }
  return { ok: false, error: 'A Anthropic respondeu com erro ao testar a chave. Tente de novo em instantes.' }
}

/** O que a tela "IA do copiloto" precisa saber. Nunca inclui a chave. */
export type LlmKeyState =
  | { mode: 'none' }
  | { mode: 'own'; hint: string; working: boolean; lastError: string | null; testedAt: string | null }
  | { mode: 'team'; teamName: string; working: boolean }
  | { mode: 'unavailable' }

export async function loadLlmKeyState(workspaceId: string): Promise<LlmKeyState> {
  const admin = supabaseAdmin()
  if (!admin) return { mode: 'unavailable' }

  const { data: row, error } = await admin
    .from('workspace_llm_keys')
    .select('key_hint, source_workspace_id, status, last_error, last_ok_at')
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (error) {
    console.error('[llm-keys] leitura do estado falhou:', error.message)
    return { mode: 'unavailable' }
  }
  if (!row) return { mode: 'none' }

  if (row.source_workspace_id) {
    const [{ data: team }, { data: source }] = await Promise.all([
      admin.from('workspaces').select('name').eq('id', row.source_workspace_id).maybeSingle(),
      admin
        .from('workspace_llm_keys')
        .select('key_hint, status')
        .eq('workspace_id', row.source_workspace_id)
        .maybeSingle(),
    ])
    return {
      mode: 'team',
      teamName: (team?.name as string | undefined) ?? 'sua equipe',
      working: Boolean(source?.key_hint) && source?.status === 'active',
    }
  }

  return {
    mode: 'own',
    hint: (row.key_hint as string | null) ?? '????',
    working: row.status === 'active',
    lastError: (row.last_error as string | null) ?? null,
    testedAt: (row.last_ok_at as string | null) ?? null,
  }
}
