import type { CopilotLlmConfig, LlmPhase } from '@meet-copilot/shared'

const NIL_UUID = '00000000-0000-0000-0000-000000000000'

/** Config default quando o workspace não configurou nada para a fase.
 *  Replica o comportamento atual: Anthropic + Sonnet como executor, advisor DESLIGADO. */
export function defaultLlmConfig(workspaceId: string, phase: LlmPhase): CopilotLlmConfig {
  return {
    id: NIL_UUID,
    workspaceId,
    phase,
    provider: 'anthropic',
    executorModel: 'claude-sonnet-5',
    advisorEnabled: false,
    advisorModel: 'claude-fable-5',
    advisorMaxUses: 0,
    advisorMaxTokens: 2048,
  }
}
