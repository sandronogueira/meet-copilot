import {
  ok,
  err,
  type ModuleOutput,
  type CopilotLlmConfig,
  type LlmMessage,
  type LlmProvider,
  type LlmUsageByRole,
  type LLMResult,
} from '@meet-copilot/shared'

/**
 * Router de LLM multi-provider do copiloto (Anthropic nativo com advisor tool /
 * Groq e NVIDIA OpenAI-compatible com advisor via client tool). Cada workspace
 * escolhe provider/modelo por fase (pre_call | live | post_call) via
 * `copilot_llm_config` — este módulo só executa a chamada e normaliza o
 * resultado, nunca decide política de negócio além do guard de fase live.
 */

// ----------------------------------------------------------------------------
// API pública
// ----------------------------------------------------------------------------

export interface RunLLMParams {
  config: CopilotLlmConfig
  /** System prompt do executor. */
  system: string
  /** Histórico (role user/assistant/tool + content string). */
  messages: LlmMessage[]
  apiKeys: { anthropic?: string; groq?: string; nvidia?: string }
  /** Se true e provider=anthropic, aplica cache_control ephemeral no system (prompt caching). */
  cacheSystem?: boolean
}

export async function runLLM(params: RunLLMParams): Promise<ModuleOutput<LLMResult>> {
  const { config } = params
  const apiKey = resolveApiKey(config.provider, params.apiKeys)
  if (!apiKey) {
    return err('LLM_NO_KEY', `API key ausente para provider ${config.provider}`)
  }

  // Guard de fase LIVE (defense-in-depth, CAMADA 2 — a camada 1 é o CHECK no banco).
  // Na fase 'live' o advisor é SEMPRE desligado, ignorando o que a config disser.
  const advisorAllowed = config.phase !== 'live' && config.advisorEnabled

  // Timeout por fase: curto na fase live (protege o tick de tempo real); as demais
  // fases toleram o advisor pausando a geração por dezenas de segundos.
  const timeoutMs = config.phase === 'live' ? 30_000 : 300_000

  if (config.provider === 'anthropic') {
    return runAnthropicPath(params, apiKey, advisorAllowed, timeoutMs)
  }

  const baseUrl =
    config.provider === 'groq' ? 'https://api.groq.com/openai/v1' : 'https://integrate.api.nvidia.com/v1'
  return runOpenAICompatiblePath(params, apiKey, baseUrl, advisorAllowed, timeoutMs)
}

function resolveApiKey(provider: LlmProvider, apiKeys: RunLLMParams['apiKeys']): string | undefined {
  if (provider === 'anthropic') return apiKeys.anthropic
  if (provider === 'groq') return apiKeys.groq
  return apiKeys.nvidia
}

/** max_tokens adequado à fase: live é sugestão curta em tempo real; as demais fases
 *  geram relatórios/propostas mais longos. Valores estimados — revisar com uso real. */
function maxTokensForPhase(phase: CopilotLlmConfig['phase']): number {
  return phase === 'live' ? 1024 : 4096
}

/** Monta o array LlmUsageByRole final: executor sempre presente; advisor só se houve tokens. */
function buildUsage(
  executorModel: string,
  executorTokensIn: number,
  executorTokensOut: number,
  advisorModel: string,
  advisorTokensIn: number,
  advisorTokensOut: number,
): LlmUsageByRole[] {
  const usage: LlmUsageByRole[] = [
    { role: 'executor', model: executorModel, tokensIn: executorTokensIn, tokensOut: executorTokensOut },
  ]
  if (advisorTokensIn > 0 || advisorTokensOut > 0) {
    usage.push({ role: 'advisor', model: advisorModel, tokensIn: advisorTokensIn, tokensOut: advisorTokensOut })
  }
  return usage
}

// ----------------------------------------------------------------------------
// Tabela de preços estática (ESTIMATIVAS — revisar antes de virar fonte de billing real)
// USD por 1M tokens. Qualquer modelo ausente do mapa (ex.: todo executor
// groq/nvidia, cujo model é o nome concreto do modelo, não o provider) cai no
// fallback de custo zero em estimateCents — cobre "executores groq/nvidia = 0".
// ----------------------------------------------------------------------------

// Preços oficiais (USD por 1M tokens) — fonte: skill claude-api, cache 2026-06-24.
// Executores groq/nvidia não constam aqui de propósito: caem no fallback de custo
// zero em estimateCents (free_tier).
export const PRICES: Record<string, { inPer1M: number; outPer1M: number }> = {
  'claude-fable-5': { inPer1M: 10, outPer1M: 50 },
  'claude-opus-4-8': { inPer1M: 5, outPer1M: 25 },
  'claude-sonnet-5': { inPer1M: 3, outPer1M: 15 },
  'claude-sonnet-4-6': { inPer1M: 3, outPer1M: 15 },
  'claude-haiku-4-5': { inPer1M: 1, outPer1M: 5 },
  'claude-haiku-4-5-20251001': { inPer1M: 1, outPer1M: 5 },
}

export function estimateCents(usage: LlmUsageByRole[]): number {
  let cents = 0
  for (const u of usage) {
    const price = PRICES[u.model] ?? { inPer1M: 0, outPer1M: 0 }
    cents += (u.tokensIn / 1_000_000) * price.inPer1M * 100
    cents += (u.tokensOut / 1_000_000) * price.outPer1M * 100
  }
  return cents
}

// ----------------------------------------------------------------------------
// CAMINHO A — provider === 'anthropic' (advisor tool nativo)
// ----------------------------------------------------------------------------

interface AnthropicSystemBlock {
  type: 'text'
  text: string
  cache_control?: { type: 'ephemeral' }
}

interface AnthropicTextBlock {
  type: 'text'
  text: string
}

interface AnthropicServerToolUseBlock {
  type: 'server_tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

interface AdvisorResult {
  type: 'advisor_result'
  text: string
  stop_reason?: string
}

interface AdvisorRedactedResult {
  type: 'advisor_redacted_result'
  encrypted_content: string
  stop_reason?: string
}

interface AdvisorToolResultError {
  type: 'advisor_tool_result_error'
  error_code: string
}

type AdvisorToolResultContent = AdvisorResult | AdvisorRedactedResult | AdvisorToolResultError

interface AnthropicAdvisorToolResultBlock {
  type: 'advisor_tool_result'
  tool_use_id: string
  content: AdvisorToolResultContent
}

interface AnthropicToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicServerToolUseBlock
  | AnthropicAdvisorToolResultBlock
  | AnthropicToolUseBlock

interface AnthropicRequestMessage {
  role: 'user' | 'assistant'
  content: string | AnthropicContentBlock[]
}

interface AnthropicAdvisorTool {
  type: 'advisor_20260301'
  name: 'advisor'
  model: string
  max_uses: number
  max_tokens: number
}

interface AnthropicRequestBody {
  model: string
  max_tokens: number
  system: AnthropicSystemBlock[]
  messages: AnthropicRequestMessage[]
  tools?: AnthropicAdvisorTool[]
}

interface AnthropicUsageIteration {
  type: 'message' | 'advisor_message'
  model?: string
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

interface AnthropicNativeUsage {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
  iterations?: AnthropicUsageIteration[]
}

interface AnthropicMessageResponse {
  role: string
  content: AnthropicContentBlock[]
  stop_reason: string
  usage: AnthropicNativeUsage
}

function toAnthropicMessage(m: LlmMessage): AnthropicRequestMessage {
  if (m.role === 'assistant') return { role: 'assistant', content: m.content }
  if (m.role === 'tool') {
    // Anthropic não tem role 'tool' de topo — dobra como user, prefixado para não
    // perder a origem do conteúdo.
    return { role: 'user', content: `[tool]\n${m.content}` }
  }
  return { role: 'user', content: m.content }
}

function extractAnthropicText(content: AnthropicContentBlock[]): string {
  return content
    .filter((b): b is AnthropicTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
}

async function postAnthropicMessages(
  body: AnthropicRequestBody,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<ModuleOutput<AnthropicMessageResponse>> {
  let res: Response
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (e) {
    return err('LLM_NET', e instanceof Error ? e.message : 'falha de rede/timeout')
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return err('LLM_HTTP', `HTTP ${res.status}`, { status: res.status, body: text.slice(0, 400) })
  }
  try {
    const json = (await res.json()) as AnthropicMessageResponse
    return ok(json)
  } catch (e) {
    return err('LLM_PARSE', e instanceof Error ? e.message : 'resposta não-JSON da Anthropic')
  }
}

async function runAnthropicPath(
  params: RunLLMParams,
  apiKey: string,
  advisorAllowed: boolean,
  timeoutMs: number,
): Promise<ModuleOutput<LLMResult>> {
  const result = await runAnthropicAttempt(params, apiKey, advisorAllowed, timeoutMs)
  // Resiliência: se a chamada COM advisor falhou com 4xx (par inválido, beta
  // indisponível), refaz UMA vez sem advisor — melhor a resposta do executor
  // sozinho do que 502 para o usuário. (429 fica de fora: rate limit deve propagar.)
  if (!result.ok && advisorAllowed && result.error.code === 'LLM_HTTP' && is4xxError(result.error)) {
    console.warn('[llm-router] chamada anthropic com advisor falhou (4xx) → retry sem advisor')
    return runAnthropicAttempt(params, apiKey, false, timeoutMs)
  }
  return result
}

function is4xxError(error: { details?: unknown }): boolean {
  const status = (error.details as { status?: number } | undefined)?.status
  return typeof status === 'number' && status >= 400 && status < 500 && status !== 429
}

async function runAnthropicAttempt(
  params: RunLLMParams,
  apiKey: string,
  advisorAllowed: boolean,
  timeoutMs: number,
): Promise<ModuleOutput<LLMResult>> {
  const MAX_RESUMES = 4
  const maxTokens = maxTokensForPhase(params.config.phase)

  const systemBlock: AnthropicSystemBlock = {
    type: 'text',
    text: params.system,
    ...(params.cacheSystem ? { cache_control: { type: 'ephemeral' } } : {}),
  }

  const headers: Record<string, string> = {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
  }
  if (advisorAllowed) headers['anthropic-beta'] = 'advisor-tool-2026-03-01'

  let currentMessages: AnthropicRequestMessage[] = params.messages.map(toAnthropicMessage)

  const textParts: string[] = []
  let advisorCalled = false
  let executorTokensIn = 0
  let executorTokensOut = 0
  let advisorTokensIn = 0
  let advisorTokensOut = 0
  let advisorModelUsed = params.config.advisorModel
  let resumeCount = 0

  for (;;) {
    const body: AnthropicRequestBody = {
      model: params.config.executorModel,
      max_tokens: maxTokens,
      system: [systemBlock],
      messages: currentMessages,
    }
    if (advisorAllowed) {
      body.tools = [
        {
          type: 'advisor_20260301',
          name: 'advisor',
          model: params.config.advisorModel,
          max_uses: params.config.advisorMaxUses,
          max_tokens: params.config.advisorMaxTokens,
        },
      ]
    }

    const res = await postAnthropicMessages(body, headers, timeoutMs)
    if (!res.ok) return res
    const data = res.data

    // Usage/custo: soma iterations (message → executor, advisor_message → advisor).
    // Sem iterations (advisor off), usa o usage top-level como executor.
    const iterations = data.usage.iterations
    if (iterations && iterations.length > 0) {
      for (const it of iterations) {
        const tokensIn = it.input_tokens + (it.cache_read_input_tokens ?? 0)
        if (it.type === 'advisor_message') {
          advisorCalled = true
          advisorTokensIn += tokensIn
          advisorTokensOut += it.output_tokens
          if (it.model) advisorModelUsed = it.model
        } else {
          executorTokensIn += tokensIn
          executorTokensOut += it.output_tokens
        }
      }
    } else {
      executorTokensIn += data.usage.input_tokens + (data.usage.cache_read_input_tokens ?? 0)
      executorTokensOut += data.usage.output_tokens
    }

    // advisorCalled: fonte de verdade é usage.iterations, mas server_tool_use é um
    // segundo sinal (nunca lemos o texto do conselho — fable-5 sempre redigido).
    for (const b of data.content) {
      if (b.type === 'server_tool_use' && b.name === 'advisor') advisorCalled = true
      if (b.type === 'advisor_tool_result' && b.content.type === 'advisor_tool_result_error') {
        console.warn(`[llm-router] advisor tool result error: ${b.content.error_code}`)
      }
    }

    textParts.push(extractAnthropicText(data.content))

    if (data.stop_reason === 'pause_turn') {
      resumeCount++
      if (resumeCount > MAX_RESUMES) break // cap estourado — para e retorna texto acumulado
      // RESUME: adiciona a assistant message (content VERBATIM) e re-envia o MESMO body.
      currentMessages = [...currentMessages, { role: 'assistant', content: data.content }]
      continue
    }

    break // end_turn, tool_use (sem client tools neste caminho) ou qualquer stop final
  }

  const usage = buildUsage(
    params.config.executorModel,
    executorTokensIn,
    executorTokensOut,
    advisorModelUsed,
    advisorTokensIn,
    advisorTokensOut,
  )
  return ok({ text: textParts.join(''), advisorCalled, usage })
}

// ----------------------------------------------------------------------------
// CAMINHO B — provider === 'groq' | 'nvidia' (OpenAI-compatible, advisor client tool)
// ----------------------------------------------------------------------------

interface OpenAIToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: OpenAIToolCall[]
  tool_call_id?: string
}

interface OpenAIToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

interface OpenAIChatRequestBody {
  model: string
  max_tokens: number
  messages: OpenAIMessage[]
  tools?: OpenAIToolDefinition[]
  tool_choice?: 'auto'
}

interface OpenAIChoice {
  message: OpenAIMessage
  finish_reason: string
}

interface OpenAIChatResponse {
  choices: OpenAIChoice[]
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}

const CONSULT_ADVISOR_TOOL: OpenAIToolDefinition = {
  type: 'function',
  function: {
    name: 'consult_advisor',
    description:
      'Consulte um modelo de raciocínio superior quando travar numa decisão que não consegue resolver ' +
      'com confiança (estratégia, correção de rota, análise complexa). Use com parcimônia.',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string' },
        context_summary: { type: 'string' },
      },
      required: ['question'],
    },
  },
}

function toOpenAIMessage(m: LlmMessage): OpenAIMessage {
  if (m.role === 'tool') {
    // LlmMessage não carrega tool_call_id — dobra como user prefixado para não
    // quebrar o contrato da Chat Completions API (role tool exige tool_call_id).
    return { role: 'user', content: `[tool]\n${m.content}` }
  }
  return { role: m.role, content: m.content }
}

async function postOpenAIChat(
  baseUrl: string,
  apiKey: string,
  body: OpenAIChatRequestBody,
  timeoutMs: number,
): Promise<ModuleOutput<OpenAIChatResponse>> {
  let res: Response
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (e) {
    return err('LLM_NET', e instanceof Error ? e.message : 'falha de rede/timeout')
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return err('LLM_HTTP', `HTTP ${res.status}`, { status: res.status, body: text.slice(0, 400) })
  }
  try {
    const json = (await res.json()) as OpenAIChatResponse
    return ok(json)
  } catch (e) {
    return err('LLM_PARSE', e instanceof Error ? e.message : 'resposta não-JSON do provider')
  }
}

/** Transcript resumido (system + turnos + tool history) para dar contexto ao advisor. */
function buildTranscriptSummary(system: string, messages: OpenAIMessage[]): string {
  const lines = messages
    .filter((m) => m.role !== 'system')
    .map((m) => `${m.role}: ${m.content ?? '[tool_calls]'}`)
  const raw = [`system: ${system}`, ...lines].join('\n')
  // Cap para não estourar o orçamento de tokens do advisor com histórico gigante.
  return raw.length > 8000 ? raw.slice(-8000) : raw
}

const ADVISOR_SYSTEM_PROMPT =
  'Você é um advisor sênior. Recebe o transcript de um agente executor e uma pergunta. ' +
  'Retorne um plano, uma correção ou um sinal de parada. Seja direto e conciso. ' +
  'NÃO execute a tarefa, apenas aconselhe.'

interface AdvisorAnthropicContentBlock {
  type: string
  text?: string
}

interface AdvisorAnthropicResponse {
  content?: AdvisorAnthropicContentBlock[]
  usage?: { input_tokens: number; output_tokens: number }
  stop_reason?: string
}

interface AdvisorConsultResult {
  text: string
  usage: { input_tokens: number; output_tokens: number }
  modelUsed: string
}

/**
 * Consulta o advisor (sempre via Anthropic, mesmo quando o executor é groq/nvidia).
 * fable-5: NÃO envia temperature nem thinking (ambos retornam 400). Trata
 * stop_reason:'refusal' (HTTP 200 com content vazio) e faz fallback automático
 * para claude-opus-4-8 em 403/404 (modelo inacessível).
 */
async function consultAdvisorViaAnthropic(
  question: string,
  contextSummary: string,
  transcriptText: string,
  advisorModel: string,
  advisorMaxTokens: number,
  anthropicKey: string,
): Promise<ModuleOutput<AdvisorConsultResult>> {
  const userContent = [
    `## Transcript do executor\n${transcriptText}`,
    contextSummary ? `## Resumo de contexto\n${contextSummary}` : '',
    `## Pergunta\n${question}`,
  ]
    .filter(Boolean)
    .join('\n\n')

  let model = advisorModel
  let fellBack = false

  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: advisorMaxTokens,
          system: ADVISOR_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userContent }],
        }),
        signal: AbortSignal.timeout(60_000),
      })
    } catch (e) {
      return err('ADVISOR_NET', e instanceof Error ? e.message : 'falha de rede/timeout ao consultar advisor')
    }

    if (!res.ok) {
      if ((res.status === 403 || res.status === 404) && !fellBack) {
        console.warn(`[llm-router] advisor ${model} inacessível → fallback opus-4-8`)
        model = 'claude-opus-4-8'
        fellBack = true
        continue
      }
      const text = await res.text().catch(() => '')
      return err('ADVISOR_HTTP', `HTTP ${res.status}`, text.slice(0, 400))
    }

    let json: AdvisorAnthropicResponse
    try {
      json = (await res.json()) as AdvisorAnthropicResponse
    } catch (e) {
      return err('ADVISOR_PARSE', e instanceof Error ? e.message : 'resposta não-JSON do advisor')
    }
    if (json.stop_reason === 'refusal') {
      return err('ADVISOR_REFUSAL', 'advisor recusou responder')
    }
    const text = (json.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('')
      .trim()
    return ok({ text, usage: json.usage ?? { input_tokens: 0, output_tokens: 0 }, modelUsed: model })
  }

  return err('ADVISOR_HTTP', 'falha persistente ao consultar advisor')
}

async function runOpenAICompatiblePath(
  params: RunLLMParams,
  executorApiKey: string,
  baseUrl: string,
  advisorAllowed: boolean,
  timeoutMs: number,
): Promise<ModuleOutput<LLMResult>> {
  const MAX_TOOL_ITERS = 4
  const maxTokens = maxTokensForPhase(params.config.phase)

  const messages: OpenAIMessage[] = [
    { role: 'system', content: params.system },
    ...params.messages.map(toOpenAIMessage),
  ]

  let advisorCalled = false
  let advisorUsesCount = 0
  let executorTokensIn = 0
  let executorTokensOut = 0
  let advisorTokensIn = 0
  let advisorTokensOut = 0
  let advisorModelUsed = params.config.advisorModel
  let finalContent = ''
  let iter = 0
  // Quando o executor estoura o cap de consultas, desligamos as tools e damos
  // uma última volta para forçar uma resposta textual (evita retorno vazio → 502).
  let toolsDisabled = false

  for (;;) {
    const body: OpenAIChatRequestBody = {
      model: params.config.executorModel,
      max_tokens: maxTokens,
      messages,
    }
    if (advisorAllowed && !toolsDisabled) {
      body.tools = [CONSULT_ADVISOR_TOOL]
      body.tool_choice = 'auto'
    }

    const res = await postOpenAIChat(baseUrl, executorApiKey, body, timeoutMs)
    if (!res.ok) return res
    const choice = res.data.choices[0]
    if (!choice) return err('LLM_EMPTY_RESPONSE', 'resposta sem choices')

    if (res.data.usage) {
      executorTokensIn += res.data.usage.prompt_tokens
      executorTokensOut += res.data.usage.completion_tokens
    }

    const toolCalls = choice.message.tool_calls
    if (!toolCalls || toolCalls.length === 0) {
      finalContent = choice.message.content ?? ''
      break
    }

    iter++
    if (iter > MAX_TOOL_ITERS) {
      // Cap estourado: registra a assistant, encerra as tool calls pendentes com
      // um sinal de parada e desliga as tools para a próxima volta produzir texto.
      messages.push(choice.message)
      for (const call of toolCalls) {
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: 'limite de consultas ao advisor atingido. Responda agora, sem novas consultas.',
        })
      }
      toolsDisabled = true
      continue
    }

    messages.push(choice.message)

    for (const call of toolCalls) {
      if (call.function.name !== 'consult_advisor') {
        messages.push({ role: 'tool', tool_call_id: call.id, content: 'ferramenta desconhecida' })
        continue
      }
      if (advisorUsesCount >= params.config.advisorMaxUses) {
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: 'max advisor uses exceeded. Continue without further advice.',
        })
        continue
      }

      let question = ''
      let contextSummary = ''
      try {
        const parsed = JSON.parse(call.function.arguments) as { question?: string; context_summary?: string }
        question = parsed.question ?? ''
        contextSummary = parsed.context_summary ?? ''
      } catch {
        // argumentos malformados — segue com question vazia (fail-soft)
      }

      const anthropicKey = params.apiKeys.anthropic
      if (!anthropicKey) {
        console.warn('[llm-router] advisor solicitado mas ANTHROPIC_API_KEY ausente, pulando')
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: 'advisor indisponível (sem API key configurada). Continue sem o conselho.',
        })
        continue
      }

      const transcriptText = buildTranscriptSummary(params.system, messages)
      const advisorRes = await consultAdvisorViaAnthropic(
        question,
        contextSummary,
        transcriptText,
        params.config.advisorModel,
        params.config.advisorMaxTokens,
        anthropicKey,
      )

      if (!advisorRes.ok) {
        console.warn(`[llm-router] advisor falhou: ${advisorRes.error.message}`)
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: 'advisor indisponível no momento. Continue sem o conselho.',
        })
        continue
      }

      advisorUsesCount++
      advisorCalled = true
      advisorModelUsed = advisorRes.data.modelUsed
      advisorTokensIn += advisorRes.data.usage.input_tokens
      advisorTokensOut += advisorRes.data.usage.output_tokens
      messages.push({ role: 'tool', tool_call_id: call.id, content: advisorRes.data.text })
    }
  }

  const usage = buildUsage(
    params.config.executorModel,
    executorTokensIn,
    executorTokensOut,
    advisorModelUsed,
    advisorTokensIn,
    advisorTokensOut,
  )
  return ok({ text: finalContent, advisorCalled, usage })
}
