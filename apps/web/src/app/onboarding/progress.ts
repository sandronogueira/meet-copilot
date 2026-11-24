/**
 * Progresso do onboarding — módulo PURO (sem 'use client' nem 'use server')
 * para ser usado tanto pela página (server) quanto pelo fluxo (client) e
 * pelas actions. É aqui que mora a regra de "retomar de onde parou".
 */

export const ONBOARDING_STEPS = ['perfil', 'conhecimento', 'clones', 'config'] as const
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]

/** Título fixo do documento criado a partir do campo "Site da empresa" do Perfil. */
export const ONBOARDING_SITE_TITLE = 'Site da empresa'

export const DEFAULT_METHODOLOGY = 'Consultiva'
export const DEFAULT_TONE = 'Equilibrado'

export function isOnboardingStep(value: unknown): value is OnboardingStep {
  return typeof value === 'string' && (ONBOARDING_STEPS as readonly string[]).includes(value)
}

/**
 * Em qual etapa o wizard abre, dado o `workspaces.onboarding_state` salvo.
 * Sem Perfil salvo não há o que retomar (as etapas seguintes dependem dele);
 * com Perfil salvo, volta para a etapa em que o usuário estava — ou, se ela
 * nunca foi registrada, para a etapa seguinte ao Perfil.
 */
export function resolveInitialStep(state: unknown): OnboardingStep {
  const s = (state && typeof state === 'object' ? state : {}) as { perfil?: unknown; step?: unknown }
  if (s.perfil !== true) return 'perfil'
  return isOnboardingStep(s.step) ? s.step : 'conhecimento'
}

/** Campos do passo Perfil que já estão no banco (fora nome/apelido, que vêm de `profiles`). */
export interface SavedProfile {
  siteUrl: string
  description: string
  segment: string
  methodology: string
  tone: string
  objections: string[]
  icp: string
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * Remonta o formulário do Perfil a partir de onde cada campo foi gravado por
 * `saveProfileStep`: abordagem em `settings.sales_profile`, descrição/segmento
 * no documento `onboarding_profile` e o site no documento de URL.
 * Tolerante a dados ausentes ou fora do formato — nunca lança.
 */
export function buildSavedProfile(input: {
  salesProfile: unknown
  profileDocMeta: unknown
  siteUrl: string | null | undefined
}): SavedProfile {
  const sales = (input.salesProfile && typeof input.salesProfile === 'object' ? input.salesProfile : {}) as Record<
    string,
    unknown
  >
  const meta = (input.profileDocMeta && typeof input.profileDocMeta === 'object' ? input.profileDocMeta : {}) as Record<
    string,
    unknown
  >
  return {
    siteUrl: text(input.siteUrl),
    description: text(meta.raw_text),
    segment: text(meta.segment),
    methodology: text(sales.methodology) || DEFAULT_METHODOLOGY,
    tone: text(sales.tone) || DEFAULT_TONE,
    objections: Array.isArray(sales.objections)
      ? sales.objections.filter((o): o is string => typeof o === 'string')
      : [],
    icp: text(sales.icp),
  }
}
