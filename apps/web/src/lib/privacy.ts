/**
 * Dados da política de privacidade que só o dono do produto pode informar.
 *
 * A página /privacidade e os links para ela só aparecem no site publicado quando
 * os campos obrigatórios estão preenchidos: uma política sem responsável, sem
 * contato ou sem a aprovação do dono não pode ir ao ar. Em desenvolvimento a
 * página abre como rascunho.
 */
export interface PrivacyPolicyInfo {
  /** Data da última mudança no texto da política (AAAA-MM-DD). Mude junto com o texto. */
  updatedAt: string
  /** Quem responde pelos dados: nome da empresa ou da pessoa. */
  controllerName: string
  /** E-mail público para pedidos sobre privacidade e exclusão de dados. */
  contactEmail: string
  /**
   * Data em que o dono do produto aprovou o texto (AAAA-MM-DD). Vazio: ainda não aprovou.
   * A política faz promessas em nome do negócio, então só ele pode liberar a publicação.
   */
  approvedOn: string
}

export const PRIVACY_POLICY: PrivacyPolicyInfo = {
  updatedAt: '2026-11-26',
  controllerName: 'Agência 2020', // informado pelo Sandro em 2026-11-26
  contactEmail: 'sandro@agencia2020.com.br', // informado pelo Sandro em 2026-11-26
  approvedOn: '2026-11-26', // o Sandro aprovou o texto em 2026-11-26 ("Aprovo")
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]

/** O que ainda falta para publicar, em português. Lista vazia: pode publicar. */
export function privacyPolicyMissing(info: PrivacyPolicyInfo = PRIVACY_POLICY): string[] {
  const missing: string[] = []
  if (info.controllerName.trim().length < 2) missing.push('o nome de quem responde pelos dados')
  if (!EMAIL.test(info.contactEmail.trim())) missing.push('o e-mail de contato')
  if (!ISO_DATE.test(info.approvedOn.trim())) missing.push('a aprovação do texto pelo responsável')
  return missing
}

export function isPrivacyPolicyReady(info: PrivacyPolicyInfo = PRIVACY_POLICY): boolean {
  return privacyPolicyMissing(info).length === 0
}

/** "2026-11-26" vira "26 de novembro de 2026", sem depender do fuso do servidor. */
export function formatPolicyDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined
  if (!match || !month) throw new Error(`Data inválida na política de privacidade: ${isoDate}`)
  return `${Number(match[3])} de ${month} de ${match[1]}`
}
