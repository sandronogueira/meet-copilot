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
  /** Última atividade (segmento ingerido) — usado pelo sweeper de sessões ociosas. */
  lastActivityAt = Date.now()
  /**
   * Inicialização assíncrona: contexto do copiloto + reidratação pós-restart
   * (P0-B). `onTick` aguarda esta promise antes de montar o prompt, para não
   * rodar o 1º tick sem a base carregada (corrida de contexto).
   */
  readonly ready: Promise<void>

  constructor(
    readonly claims: SessionClaims,
    private readonly persistence: Persistence,
    private readonly pipeline: CopilotPipeline | null,
  ) {
    this.trigger = new TriggerEngine((reason) => void this.onTick(reason))
    this.ready = this.initialize()
  }

  /** Carrega contexto do copiloto e reidrata o buffer a partir do Postgres. Fail-soft. */
  private async initialize(): Promise<void> {
    try {
      const ctx = await this.persistence.loadContext(this.claims.workspaceId, this.claims.meetingId)
      this.applyContext(ctx)
    } catch (e) {
      console.error(`[session ${this.claims.meetingId}] loadContext:`, e)
    }
    try {
      const segs = await this.persistence.loadRecentSegments(this.claims.meetingId)
      if (this.buffer.hydrate(segs)) {
        console.log(`[session ${this.claims.meetingId}] reidratado: ${segs.length} segmento(s) recente(s)`)
      }
    } catch (e) {
      console.error(`[session ${this.claims.meetingId}] reidratação:`, e)
    }
  }

  /** Ritmo real por nível de interrupção do clone — não é só texto de prompt. */
  private static readonly PACE = {
    discreto: { minWordsPerTurn: 60, maxIntervalMs: 60_000, cooldownMs: 45_000 },
    moderado: { minWordsPerTurn: 40, maxIntervalMs: 25_000, cooldownMs: 10_000 },
    ativo: { minWordsPerTurn: 25, maxIntervalMs: 15_000, cooldownMs: 6_000 },
  } as const

  private applyContext(ctx: CopilotContext): void {
    this.context = ctx
    const pace = Session.PACE[ctx.interruption ?? 'moderado']
    this.trigger.updateConfig(pace)
    console.log(
      `[session ${this.claims.meetingId}] contexto: clone=${ctx.expertName ?? '—'} ritmo=${ctx.interruption ?? 'moderado'} base=${ctx.contextText.length} chars`,
    )
  }

  /** Entrada bruta do WS do Recall — parse tolerante, fail-soft. */
  async handleRawMessage(raw: string): Promise<void> {
    this.lastActivityAt = Date.now()
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
    this.lastActivityAt = Date.now()
    // reidratação ANTES do 1º append: sem isso, áudio chegando durante o
    // initialize() recomeçava o seq em 1 e duplicava segmentos no banco
    await this.ready.catch(() => {})
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
    this.applyContext(await this.persistence.loadContext(this.claims.workspaceId, this.claims.meetingId))
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
      // corrida de contexto: garante que loadContext (P0-B) já rodou antes do 1º tick
      await this.ready.catch(() => {})
      const ctx = this.context ?? {
        expertStyle: null,
        expertName: null,
        interruption: null,
        salesProfile: null,
        contextText: '',
      }
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

/** Sessão sem áudio novo por este tempo é considerada abandonada e encerrada. */
const IDLE_MS = Number(process.env.SESSION_IDLE_MS) || 1_800_000 // 30min

export class SessionManager {
  private sessions = new Map<string, Session>()

  constructor(
    private readonly persistence: Persistence,
    private readonly pipeline: CopilotPipeline | null,
  ) {
    // Sweeper: sem ele, sessões abandonadas (painel fechado sem Encerrar)
    // acumulavam timer + buffer + canal para sempre → memória estourava →
    // container reiniciava no meio de reuniões ativas ("do nada parou").
    setInterval(() => this.sweep(), 60_000)
  }

  private sweep(): void {
    let closed = 0
    const now = Date.now()
    for (const [meetingId, session] of this.sessions) {
      if (now - session.lastActivityAt > IDLE_MS) {
        this.close(meetingId)
        void this.persistence.endMeeting(meetingId)
        closed++
      }
    }
    if (closed > 0 || this.sessions.size > 0) {
      console.log(`[sweeper] ativas=${this.sessions.size} encerradas_por_inatividade=${closed}`)
    }
  }

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
    this.persistence.closeChannel(meetingId)
    this.sessions.delete(meetingId)
    console.log(`[sessions] fechada ${meetingId} (total: ${this.sessions.size})`)
  }

  get count(): number {
    return this.sessions.size
  }

  get idleMs(): number {
    return IDLE_MS
  }
}
