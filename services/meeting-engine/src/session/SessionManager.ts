import {
  recallRealtimeEventSchema,
  normalizeRecallEvent,
  type TranscriptSegmentInput,
} from '@meet-copilot/shared'
import { TranscriptBuffer } from './TranscriptBuffer'
import { TriggerEngine, type TickReason } from '../pipeline/TriggerEngine'
import type { Persistence } from '../lib/persistence'

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

  constructor(
    readonly claims: SessionClaims,
    private readonly persistence: Persistence,
  ) {
    this.trigger = new TriggerEngine((reason) => void this.onTick(reason))
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

  private async onTick(reason: TickReason): Promise<void> {
    this.buffer.markTicked()
    const window = this.buffer.window()
    // TODO(F3): CopilotPipeline — router Haiku (structured output) decide se
    // vale sugestão / há claims; gerador Sonnet + RAG produz sugestões.
    // TODO(F4): claims materiais → FactCheckService (fila, máx 2 paralelos).
    console.log(
      `[session ${this.claims.meetingId}] tick(${reason}) — janela com ${window.length} chars`,
    )
  }

  close(): void {
    this.trigger.dispose()
  }
}

export class SessionManager {
  private sessions = new Map<string, Session>()

  constructor(private readonly persistence: Persistence) {}

  open(claims: SessionClaims): Session {
    const existing = this.sessions.get(claims.meetingId)
    if (existing) return existing // reconexão do Recall reusa o ator

    const session = new Session(claims, this.persistence)
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
