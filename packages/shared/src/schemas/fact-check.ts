import { z } from 'zod'

export const factCheckVerdictSchema = z.enum([
  'supported',
  'partially_supported',
  'unverified',
  'disputed',
])
export type FactCheckVerdict = z.infer<typeof factCheckVerdictSchema>

export const factCheckSourceSchema = z.object({
  url: z.url(),
  title: z.string(),
  quote: z.string().optional(),
  accessed_at: z.string().optional(),
})

export const factCheckResultSchema = z
  .object({
    verdict: factCheckVerdictSchema,
    confidence: z.enum(['low', 'medium', 'high']),
    summary: z.string().max(600),
    sources: z.array(factCheckSourceSchema).default([]),
  })
  // Regra de produto, não de prompt: sem fonte, o veredito é SEMPRE 'unverified'.
  // Não confiamos no modelo para isso — o schema força.
  .transform((r) =>
    r.sources.length === 0 && r.verdict !== 'unverified'
      ? { ...r, verdict: 'unverified' as const, confidence: 'low' as const }
      : r,
  )

export type FactCheckResult = z.infer<typeof factCheckResultSchema>

/** Vocabulário fixo da UI — nunca "falso/mentira". */
export const verdictLabelPtBr: Record<FactCheckVerdict, string> = {
  supported: 'Confirmado por fontes',
  partially_supported: 'Parcialmente confirmado',
  unverified: 'Não encontrei fontes',
  disputed: 'Fontes divergem',
}
