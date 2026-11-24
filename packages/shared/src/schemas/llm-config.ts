import { z } from 'zod'

/**
 * Configuração de LLM por workspace + fase da reunião (pre_call / live / post_call).
 * O llm-router.ts (implementado à parte) lê esta config para decidir qual provider/modelo
 * usar como executor, e se — e com que orçamento — o advisor (Fable) pode ser acionado.
 */

export const llmPhaseSchema = z.enum(['pre_call', 'live', 'post_call'])
export type LlmPhase = z.infer<typeof llmPhaseSchema>

export const llmProviderSchema = z.enum(['anthropic', 'groq', 'nvidia'])
export type LlmProvider = z.infer<typeof llmProviderSchema>

export const copilotLlmConfigSchema = z
  .object({
    id: z.string().uuid(),
    // camelCase no TS; o banco usa workspace_id — o mapeamento é responsabilidade
    // da camada de persistência, não deste schema.
    workspaceId: z.string().uuid(),
    phase: llmPhaseSchema,
    provider: llmProviderSchema,
    executorModel: z.string().min(1),
    advisorEnabled: z.boolean(),
    // default conceitual 'claude-fable-5' — o valor default de fato vive no banco,
    // aqui só exigimos que, se vier, seja uma string não vazia.
    advisorModel: z.string().min(1),
    advisorMaxUses: z.number().int().min(0),
    // a doc do advisor tool exige um mínimo de 1024 tokens de orçamento
    advisorMaxTokens: z.number().int().min(1024),
  })
  .superRefine((config, ctx) => {
    // Regra de negócio: na fase live o advisor é PROIBIDO por latência —
    // acionar o Fable no meio da chamada estouraria o orçamento de tempo de resposta.
    if (config.phase === 'live' && config.advisorEnabled) {
      ctx.addIssue({
        code: 'custom',
        message: 'advisorEnabled não pode ser true quando phase é "live": o advisor é proibido na fase live por latência.',
        path: ['advisorEnabled'],
      })
    }
    // Advisor ligado com max_uses 0 oferece a ferramenta mas rejeita toda chamada
    // ("max uses exceeded"), queimando iterações à toa — exige pelo menos 1 uso.
    if (config.advisorEnabled && config.advisorMaxUses < 1) {
      ctx.addIssue({
        code: 'custom',
        message: 'advisorMaxUses deve ser >= 1 quando advisorEnabled é true.',
        path: ['advisorMaxUses'],
      })
    }
  })

export type CopilotLlmConfig = z.infer<typeof copilotLlmConfigSchema>

/**
 * Mensagem genérica trocada com o LLM. Mantida simples de propósito: o llm-router.ts
 * é responsável por converter isso para o formato específico de cada provider
 * (Anthropic, Groq, NVIDIA).
 */
export const llmMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'tool']),
  content: z.string(),
})

export type LlmMessage = z.infer<typeof llmMessageSchema>

/**
 * Uso de tokens por papel (executor ou advisor) numa chamada ao router.
 * Interface pura TS — não precisa de validação Zod porque é gerada internamente
 * pelo router, nunca é input não confiável vindo de fora.
 */
export interface LlmUsageByRole {
  role: 'executor' | 'advisor'
  model: string
  tokensIn: number
  tokensOut: number
}

/**
 * Resultado consolidado de uma chamada ao llm-router.ts.
 * Interface pura TS pelo mesmo motivo de LlmUsageByRole acima.
 */
export interface LLMResult {
  text: string
  advisorCalled: boolean
  usage: LlmUsageByRole[]
}
