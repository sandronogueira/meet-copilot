import { z } from 'zod'

/**
 * MeetingFacts: extração estruturada da reunião (Opus, structured output).
 * Alimenta tanto o relatório pós-reunião quanto a geração de proposta.
 */

export const meetingFactsSchema = z.object({
  clienteNome: z.string().nullable(),
  empresa: z.string().nullable(),
  dores: z.array(z.string()).default([]),
  objecoes: z.array(z.string()).default([]),
  orcamentoSinalizado: z.string().nullable(),
  prazos: z.array(z.string()).default([]),
  escopoDiscutido: z.array(z.string()).default([]),
  decisores: z.array(z.string()).default([]),
})

export type MeetingFacts = z.infer<typeof meetingFactsSchema>

export const actionItemSchema = z.object({
  descricao: z.string(),
  responsavel: z.string().nullable(),
  prazo: z.string().nullable(),
})

export const reportSchema = z.object({
  summary: z.string(),
  decisions: z.array(z.string()).default([]),
  actionItems: z.array(actionItemSchema).default([]),
  redFlags: z.array(z.string()).default([]),
  objections: z.array(z.string()).default([]),
  nextSteps: z.array(z.string()).default([]),
})

export type Report = z.infer<typeof reportSchema>
