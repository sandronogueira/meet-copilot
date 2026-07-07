import {
  recallRealtimeEventSchema,
  normalizeRecallEvent,
  type TranscriptSegmentInput,
} from '@meet-copilot/shared'
import { TranscriptBuffer } from './TranscriptBuffer'
import { TriggerEngine, type TickReason } from '../pipeline/TriggerEngine'
import { CopilotPipeline } from '../pipeline/CopilotPipeline'
import type { Persistence, CopilotContext } from '../lib/persistence'

export interface SessionClaims {
  meetingId: string
  workspaceId: string
  /** speaker label do usuário do copiloto (is_self) para supressão de triggers */
  selfLabel?: string
}

/** Ator de UMA reunião: buffer + triggers + pipeline + persistência. */
export class Session {
  readonly buffer = new TranscriptBuffer()
  private readonly trigger: TriggerEngine
  private context: CopilotContext | null = null
  private recentSuggestions: string[] = []
  /** timestamp do tick em andamento (null = livre). Watchdog libera após 90s. */
  private tickingSince: number | null = null

  constructor(
    readonly claims: SessionClaims,
    private readonly persistence: Persistence,
    private readonly pipeline: CopilotPipeline | null,
  ) {
    this.trigger = new TriggerEngine((reason) => void this.onTick(reason))
    // carrega o contexto do copiloto uma vez, em background (fail-soft)
    void this.persistence
      .loadContext(claims.workspaceId, claims.meetingId)
      .then((ctx) => {
        this.context = ctx
      })
      .catch((e: unknown) => console.error(`[session ${claims.meetingId}] loadContext:`, e))
  }

  /** Entrada bruta do WS do Recall — parse tolerante, fail-soft. */
  async handleRawMessage(raw: string): Promise<void> {
    let json: unknown
    try {
      json = JSON.parse(raw)
    } catch {
      return // frame não-JSON: ignora
    }

    const parsed = recallRealtimeEventSchema.safeParse(json)
    if (!parsed.success) return // evento de outro tipo/versão: ignora

    const seg = normalizeRecallEvent(parsed.data)
    if (!seg) return

    if (!seg.isFinal) {
      await this.persistence.publishSegment(this.claims.meetingId, seg, null)
      return
    }
    await this.ingestSegment(seg)
  }

  /** Entrada pública de segmento final — usada pelo WS (Recall) e pelo /ingest (extensão). */
  async ingestSegment(seg: TranscriptSegmentInput): Promise<void> {
    const turnEnded = this.buffer.isTurnEnd(seg)
    const buffered = this.buffer.append(seg)

    await this.persistence.publishSegment(this.claims.meetingId, seg, buffered.seq)

    const result = await this.persistence.insertSegment(
      this.claims.workspaceId,
      this.claims.meetingId,
      seg,
      buffered.seq,
    )
    if (!result.ok) {
      // fail-soft: erro de persistência é logado, não derruba a sessão
      console.error(`[session ${this.claims.meetingId}] persistência falhou:`, result.error)
    }

    this.trigger.noteSegment({
      turnEnded,
      wordsSinceLastTick: this.buffer.wordsSinceLastTick,
      isSelf: seg.speakerLabel === this.claims.selfLabel,
    })
  }

  /** T3: acionado pelo painel via API. */
  manualTick(): void {
    this.trigger.manualTick()
  }

  /** Recarrega o contexto (clone/base) — usado na troca de clone no meio da reunião. */
  async reloadContext(): Promise<void> {
    this.context = await this.persistence.loadContext(this.claims.workspaceId, this.claims.meetingId)
  }

  private async onTick(reason: TickReason): Promise<void> {
    this.buffer.markTicked()
    const window = this.buffer.window()

    if (!this.pipeline) {
      console.log(`[session ${this.claims.meetingId}] tick(${reason}) — pipeline off (sem ANTHROPIC_API_KEY)`)
      return
    }
    // evita ticks concorrentes; watchdog libera trava presa (tick > 90s = zumbi)
    if (this.tickingSince !== null) {
      if (Date.now() - this.tickingSince < 90_000) return
      console.warn(`[session ${this.claims.meetingId}] watchdog: tick preso há >90s — liberando trava`)
    }
    this.tickingSince = Date.now()
    try {
      const ctx = this.context ?? { expertStyle: null, expertName: null, salesProfile: null, contextText: '' }
      const result = await this.pipeline.run(window, ctx, this.recentSuggestions)
      console.log(
        `[session ${this.claims.meetingId}] tick(${reason}): ${result.suggestions.length} sugestão(ões)`,
      )
      for (const sug of result.suggestions) {
        this.recentSuggestions.push(sug.content)
        await this.persistence.insertSuggestion(this.claims.workspaceId, this.claims.meetingId, sug, {
          model: result.usage.model,
          tokensIn: result.usage.tokensIn,
          tokensOut: result.usage.tokensOut,
        })
      }
      // TODO(F4): claims materiais do router → FactCheckService com web_search.
    } catch (e) {
      console.error(`[session ${this.claims.meetingId}] pipeline erro (fail-soft):`, e)
    } finally {
      this.tickingSince = null
    }
  }

  close(): void {
    this.trigger.dispose()
  }
}

export class SessionManager {
  private sessions = new Map<string, Session>()

  constructor(
    private readonly persistence: Persistence,
    private readonly pipeline: CopilotPipeline | null,
  ) {}

  get(meetingId: string): Session | undefined {
    return this.sessions.get(meetingId)
  }

  open(claims: SessionClaims): Session {
    const existing = this.sessions.get(claims.meetingId)
    if (existing) return existing // reconexão do Recall reusa o ator

    const session = new Session(claims, this.persistence, this.pipeline)
    this.sessions.set(claims.meetingId, session)
    console.log(`[sessions] aberta ${claims.meetingId} (total: ${this.sessions.size})`)
    return session
  }

  close(meetingId: string): void {
    const session = this.sessions.get(meetingId)
    if (!session) return
    session.close()
    this.sessions.delete(meetingId)
    console.log(`[sessions] fechada ${meetingId} (total: ${this.sessions.size})`)
  }

  get count(): number {
    return this.sessions.size
  }
}
