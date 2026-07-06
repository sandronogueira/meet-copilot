import { z } from 'zod'

/**
 * Config do Recall.ai + meeting-engine — opcional em dev (F0/F0.5):
 * a rota devolve erro amigável enquanto as contas não são configuradas.
 */
const recallEnvSchema = z.object({
  RECALL_API_BASE: z.string().default('https://us-east-1.recall.ai'),
  RECALL_API_KEY: z.string().min(1),
  ENGINE_WS_URL: z.string().min(1),
  ENGINE_WS_SECRET: z.string().min(32),
})

export type RecallEnv = z.infer<typeof recallEnvSchema>

export function recallEnv(): RecallEnv | null {
  const parsed = recallEnvSchema.safeParse(process.env)
  return parsed.success ? parsed.data : null
}

export const webhookSecret = (): string | undefined => process.env.RECALL_WEBHOOK_SECRET

/** Supabase service_role — apenas para o webhook do Recall (sem sessão de usuário). */
const adminEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
})

export type AdminEnv = z.infer<typeof adminEnvSchema>

export function adminEnv(): AdminEnv | null {
  const parsed = adminEnvSchema.safeParse(process.env)
  return parsed.success ? parsed.data : null
}
