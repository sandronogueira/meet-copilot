import { z } from 'zod'

/**
 * Proposta comercial em 3 camadas:
 *  1. ProposalTemplate (este arquivo) — configurado por workspace; define seções e tema.
 *  2. MeetingFacts (report.ts) — extraído da reunião.
 *  3. ProposalContent — LLM preenche os slots; preços vêm SÓ de defaultPackages
 *     (validação server-side compara — o LLM escolhe pacotes, não inventa números).
 * O LLM nunca gera HTML/CSS: o render é feito por componentes a partir deste JSON.
 */

export const packageSchema = z.object({
  id: z.string(),
  nome: z.string(),
  precoCents: z.number().int().nonnegative(),
  moeda: z.string().default('BRL'),
  periodo: z.enum(['unico', 'mensal', 'anual']).default('mensal'),
  destaque: z.boolean().default(false),
  itens: z.array(z.string()).default([]),
})

export type ProposalPackage = z.infer<typeof packageSchema>

const base = { id: z.string(), titulo: z.string().optional() }

export const proposalSectionSchema = z.discriminatedUnion('tipo', [
  z.object({ ...base, tipo: z.literal('hero'), headline: z.string(), subheadline: z.string().optional(), clienteNome: z.string().optional() }),
  z.object({ ...base, tipo: z.literal('contexto'), bodyMd: z.string() }),
  z.object({ ...base, tipo: z.literal('solucao'), bodyMd: z.string(), pilares: z.array(z.object({ titulo: z.string(), descricao: z.string() })).default([]) }),
  z.object({ ...base, tipo: z.literal('escopo'), itens: z.array(z.object({ titulo: z.string(), descricao: z.string().optional() })) }),
  z.object({ ...base, tipo: z.literal('pacotes'), pacotes: z.array(packageSchema) }),
  z.object({ ...base, tipo: z.literal('investimento'), linhas: z.array(z.object({ descricao: z.string(), valorCents: z.number().int(), periodo: z.string().optional() })), observacoes: z.string().optional() }),
  z.object({ ...base, tipo: z.literal('cronograma'), etapas: z.array(z.object({ titulo: z.string(), duracao: z.string(), descricao: z.string().optional() })) }),
  z.object({ ...base, tipo: z.literal('cases'), cases: z.array(z.object({ titulo: z.string(), resultado: z.string(), descricao: z.string().optional() })) }),
  z.object({ ...base, tipo: z.literal('equipe'), membros: z.array(z.object({ nome: z.string(), papel: z.string(), fotoUrl: z.string().optional() })) }),
  z.object({ ...base, tipo: z.literal('faq'), perguntas: z.array(z.object({ pergunta: z.string(), resposta: z.string() })) }),
  z.object({ ...base, tipo: z.literal('cta'), texto: z.string(), botaoLabel: z.string().default('Aceitar proposta'), validadeDias: z.number().int().default(14) }),
])

export type ProposalSection = z.infer<typeof proposalSectionSchema>

export const proposalThemeSchema = z.object({
  bg: z.string().default('#0A0A0B'),
  fg: z.string().default('#F5F5F4'),
  accent: z.string().default('#22D3EE'),
  fontHeading: z.string().default('Inter'),
  fontBody: z.string().default('Inter'),
  logoUrl: z.string().optional(),
})

export type ProposalTheme = z.infer<typeof proposalThemeSchema>

export const proposalTemplateSchema = z.object({
  engineVersion: z.literal(1),
  sections: z.array(proposalSectionSchema),
  theme: proposalThemeSchema.prefault({}),
  /** Tabela OFICIAL de preços do workspace — única fonte válida de valores. */
  defaultPackages: z.array(packageSchema).default([]),
  copyGuidelines: z.string().max(2000).optional(),
})

export type ProposalTemplate = z.infer<typeof proposalTemplateSchema>

export const proposalContentSchema = z.object({
  engineVersion: z.literal(1),
  clienteNome: z.string(),
  sections: z.array(proposalSectionSchema),
})

export type ProposalContent = z.infer<typeof proposalContentSchema>

/**
 * Guarda server-side: todo preço no content precisa existir na tabela oficial.
 * Retorna a lista de violações (vazia = ok).
 */
export function validatePricesAgainstOfficial(
  content: ProposalContent,
  official: ProposalPackage[],
): string[] {
  const allowed = new Set(official.map((p) => `${p.id}:${p.precoCents}`))
  const violations: string[] = []
  for (const section of content.sections) {
    if (section.tipo === 'pacotes') {
      for (const pkg of section.pacotes) {
        if (!allowed.has(`${pkg.id}:${pkg.precoCents}`)) {
          violations.push(`Pacote "${pkg.nome}" (${pkg.id}) com preço fora da tabela oficial`)
        }
      }
    }
  }
  return violations
}
