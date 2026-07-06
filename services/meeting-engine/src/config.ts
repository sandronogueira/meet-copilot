import { z } from 'zod'

/** Env vazia ("") conta como ausente — evita que `KEY=` no .env passe como string válida. */
const optionalEnv = z.preprocess((v) => (v === '' ? undefined : v), z.string().optional())

const envSchema = z.object({
  PORT: z.coerce.number().int().default(8080),
  ENGINE_WS_SECRET: z.string().min(32, 'ENGINE_WS_SECRET precisa de >= 32 chars (openssl rand -hex 32)'),
  SUPABASE_URL: optionalEnv,
  SUPABASE_SERVICE_ROLE_KEY: optionalEnv,
  SUPABASE_ANON_KEY: optionalEnv,
  GROQ_API_KEY: optionalEnv,
  ANTHROPIC_API_KEY: optionalEnv,
})

export type EngineConfig = z.infer<typeof envSchema>

export function loadConfig(): EngineConfig {
  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    console.error('[config] variáveis de ambiente inválidas:', parsed.error.flatten().fieldErrors)
    process.exit(1)
  }
  if (!parsed.data.SUPABASE_URL || !parsed.data.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('[config] Supabase ausente — rodando em modo log-only (sem persistência)')
  }
  return parsed.data
}
