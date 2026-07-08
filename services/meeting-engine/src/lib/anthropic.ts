import { ok, err, type ModuleOutput } from '@meet-copilot/shared'

/**
 * Cliente Anthropic mínimo (fetch, sem SDK) com suporte a prompt caching.
 * Modelos: Haiku 4.5 (router barato) · Sonnet (gerador) · Opus (propostas).
 */

export const MODELS = {
  router: 'claude-haiku-4-5-20251001',
  generator: 'claude-sonnet-5',
} as const

interface SystemBlock {
  type: 'text'
  text: string
  cache_control?: { type: 'ephemeral' }
}

interface MessageParams {
  model: string
  system: SystemBlock[]
  userText: string
  maxTokens: number
  temperature?: number
}

export interface AnthropicUsage {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

export class Anthropic {
  constructor(private apiKey: string) {}

  async complete(params: MessageParams): Promise<ModuleOutput<{ text: string; usage: AnthropicUsage }>> {
    const body: Record<string, unknown> = {
      model: params.model,
      max_tokens: params.maxTokens,
      system: params.system,
      messages: [{ role: 'user', content: params.userText }],
    }
    // temperature é deprecado em alguns modelos (ex.: sonnet-5) — só envia quando pedido
    if (params.temperature !== undefined) body.temperature = params.temperature

    // Timeout OBRIGATÓRIO: um fetch pendurado travava o tick da sessão para sempre
    // (a trava `ticking` nunca liberava) — sugestões morriam até o restart do engine.
    let res: Response
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      })
    } catch (e) {
      return err('ANTHROPIC_NET', e instanceof Error ? e.message : 'falha de rede/timeout')
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return err('ANTHROPIC', `HTTP ${res.status}`, body.slice(0, 400))
    }

    const json = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>
      usage?: AnthropicUsage
    }
    const text = (json.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('')
      .trim()

    return ok({ text, usage: json.usage ?? { input_tokens: 0, output_tokens: 0 } })
  }
}

/**
 * Extrai o primeiro objeto JSON de um texto (o modelo às vezes embrulha em
 * prosa/```). Resiliente a TRUNCAMENTO por max_tokens: repara o JSON cortado
 * (fecha string aberta e balanceia chaves) em vez de descartar a rodada.
 */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/)
  const raw = fenced ? fenced[1]! : text
  const start = raw.indexOf('{')
  if (start === -1) return null
  const end = raw.lastIndexOf('}')
  if (end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1))
    } catch {
      // cai no reparo abaixo
    }
  }
  return repairTruncatedJson(raw.slice(start))
}

/** Melhor sugestão truncada do que nenhuma: fecha o que ficou aberto e re-parseia. */
function repairTruncatedJson(input: string): unknown {
  let out = input.trimEnd().replace(/,\s*$/, '')
  const closers: string[] = []
  let inString = false
  for (let i = 0; i < out.length; i++) {
    const c = out[i]
    if (inString) {
      if (c === '\\') i++
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === '{') closers.push('}')
    else if (c === '[') closers.push(']')
    else if (c === '}' || c === ']') closers.pop()
  }
  if (inString) out += '"'
  out = out.replace(/,\s*$/, '')
  while (closers.length) out += closers.pop()
  try {
    return JSON.parse(out)
  } catch {
    return null
  }
}
