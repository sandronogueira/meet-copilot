import { z } from 'zod'

export const suggestionKindSchema = z.enum(['question', 'insight', 'objection', 'next_step', 'risk'])
export type SuggestionKind = z.infer<typeof suggestionKindSchema>

/**
 * Saída do gerador (Sonnet) — 1 a 2 sugestões por tick aprovado.
 * TOLERANTE por design: saída de LLM excedendo limites é TRUNCADA, nunca
 * rejeitada — um max() rígido aqui descartava rodadas inteiras em silêncio.
 */
export const generatedSuggestionSchema = z.object({
  kind: suggestionKindSchema,
  content: z
    .string()
    .min(1)
    .transform((s) => s.slice(0, 600)),
  rationale: z
    .string()
    .optional()
    .transform((s) => s?.slice(0, 600)),
  /** ids dos chunks da Base de Contexto usados — auditabilidade do RAG */
  contextRefs: z.array(z.coerce.string()).default([]),
})

export type GeneratedSuggestion = z.infer<typeof generatedSuggestionSchema>

export const generatorOutputSchema = z.object({
  // o modelo às vezes manda 3+ — aproveita as 2 primeiras em vez de jogar tudo fora
  suggestions: z.array(generatedSuggestionSchema).transform((a) => a.slice(0, 2)),
})

export type GeneratorOutput = z.infer<typeof generatorOutputSchema>
