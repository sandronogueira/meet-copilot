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
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: params.model,
        max_tokens: params.maxTokens,
        temperature: params.temperature ?? 0.4,
        system: params.system,
        messages: [{ role: 'user', content: params.userText }],
      }),
    })

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

/** Extrai o primeiro objeto JSON de um texto (o modelo às vezes embrulha em prosa/```). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fenced ? fenced[1]! : text
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  try {
    return JSON.parse(raw.slice(start, end + 1))
  } catch {
    return null
  }
}
