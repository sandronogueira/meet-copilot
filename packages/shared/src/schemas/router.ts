import { z } from 'zod'

/**
 * Saída do tick barato (router Haiku): decide se vale gastar o modelo caro.
 * IMPORTANTE: a transcrição é INPUT NÃO CONFIÁVEL (prompt injection via fala) —
 * a saída do router só é aceita se validar contra este schema.
 */

export const claimSchema = z.object({
  texto: z.string().min(1),
  speaker: z.string(),
  verificavel: z.boolean(),
  materialidade: z.number().int().min(1).max(5),
})

export type Claim = z.infer<typeof claimSchema>

export const routerOutputSchema = z.object({
  novoTopico: z.boolean(),
  valeSugestao: z.boolean(),
  tipoSugestao: z.enum(['question', 'insight', 'objection', 'next_step', 'risk']).nullable(),
  claims: z.array(claimSchema).default([]),
  urgencia: z.number().int().min(1).max(5),
})

export type RouterOutput = z.infer<typeof routerOutputSchema>
