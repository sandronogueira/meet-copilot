export type TickReason = 'turn' | 'timer' | 'manual'

export interface TriggerConfig {
  /** T1: mínimo de palavras novas para tick em fim de turno */
  minWordsPerTurn: number
  /** T2: intervalo máximo com texto novo acumulado (fallback) */
  maxIntervalMs: number
  /** supressão: intervalo mínimo entre ticks */
  cooldownMs: number
}

const DEFAULTS: TriggerConfig = {
  minWordsPerTurn: 40,
  maxIntervalMs: 25_000,
  cooldownMs: 10_000,
}

/**
 * Decide QUANDO gastar LLM. Determinístico, não-LLM (princípio do ecossistema):
 *  T1 fim de turno com >= N palavras novas · T2 timer de fallback · T3 manual.
 * T1 prioriza a fala do prospect; T2 dispara com QUALQUER fala acumulada —
 * inclusive quando só o vendedor fala (reunião de apresentação), senão o
 * copiloto fica mudo justamente quando o usuário domina a conversa.
 */
export class TriggerEngine {
  private cfg: TriggerConfig
  private lastTickAt = 0
  private pendingWords = 0
  private timer: ReturnType<typeof setInterval>

  constructor(
    private onTick: (reason: TickReason) => void,
    cfg: Partial<TriggerConfig> = {},
  ) {
    this.cfg = { ...DEFAULTS, ...cfg }
    this.timer = setInterval(() => this.checkTimer(), 5_000)
  }

  noteSegment(params: { turnEnded: boolean; wordsSinceLastTick: number; isSelf: boolean }): void {
    this.pendingWords = params.wordsSinceLastTick

    if (
      params.turnEnded &&
      !params.isSelf &&
      params.wordsSinceLastTick >= this.cfg.minWordsPerTurn &&
      this.cooldownOk()
    ) {
      this.fire('turn')
    }
  }

  /** T3: botão "me ajuda agora" — bypassa cooldown e contagem. */
  manualTick(): void {
    this.fire('manual')
  }

  /** Recalibra o ritmo em runtime (nível de interrupção do clone ativo). */
  updateConfig(cfg: Partial<TriggerConfig>): void {
    this.cfg = { ...this.cfg, ...cfg }
  }

  dispose(): void {
    clearInterval(this.timer)
  }

  private checkTimer(): void {
    // Sem exigir !selfSpeaking: com captura em chunks de ~15s, o "último a falar"
    // é quase sempre o usuário quando ele domina a conversa — e o timer ficava
    // eternamente bloqueado, sem gerar nenhuma sugestão na reunião inteira.
    if (
      this.pendingWords > 0 &&
      Date.now() - this.lastTickAt >= this.cfg.maxIntervalMs &&
      this.cooldownOk()
    ) {
      this.fire('timer')
    }
  }

  private cooldownOk(): boolean {
    return Date.now() - this.lastTickAt >= this.cfg.cooldownMs
  }

  private fire(reason: TickReason): void {
    this.lastTickAt = Date.now()
    this.pendingWords = 0
    this.onTick(reason)
  }
}
