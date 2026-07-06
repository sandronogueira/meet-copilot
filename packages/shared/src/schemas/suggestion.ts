import { z } from 'zod'

export const suggestionKindSchema = z.enum(['question', 'insight', 'objection', 'next_step', 'risk'])
export type SuggestionKind = z.infer<typeof suggestionKindSchema>

/** Saída do gerador (Sonnet) — 1 a 2 sugestões por tick aprovado. */
export const generatedSuggestionSchema = z.object({
  kind: suggestionKindSchema,
  content: z.string().min(1).max(600),
  rationale: z.string().max(600).optional(),
  /** ids dos chunks da Base de Contexto usados — auditabilidade do RAG */
  contextRefs: z.array(z.string()).default([]),
})

export type GeneratedSuggestion = z.infer<typeof generatedSuggestionSchema>

export const generatorOutputSchema = z.object({
  suggestions: z.array(generatedSuggestionSchema).min(0).max(2),
})

export type GeneratorOutput = z.infer<typeof generatorOutputSchema>
