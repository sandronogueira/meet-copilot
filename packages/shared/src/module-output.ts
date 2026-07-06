/**
 * Envelope universal de retorno entre módulos (padrão do ecossistema).
 * Nenhum módulo lança exceção para o chamador — sempre retorna ModuleOutput<T>.
 */

export interface ModuleError {
  code: string
  message: string
  details?: unknown
}

export type ModuleOutput<T> =
  | { ok: true; data: T }
  | { ok: false; error: ModuleError }

export function ok<T>(data: T): ModuleOutput<T> {
  return { ok: true, data }
}

export function err(code: string, message: string, details?: unknown): ModuleOutput<never> {
  return { ok: false, error: { code, message, details } }
}
