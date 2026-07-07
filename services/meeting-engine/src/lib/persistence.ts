import { createClient, type SupabaseClient, type RealtimeChannel } from '@supabase/supabase-js'
import {
  ok,
  err,
  type ModuleOutput,
  type TranscriptSegmentInput,
  type GeneratedSuggestion,
  type Report,
} from '@meet-copilot/shared'
import type { EngineConfig } from '../config'

/** Contexto do copiloto para uma reunião (o QUE o agente sabe + COMO pensa). */
export interface CopilotContext {
  expertStyle: string | null
  expertName: string | null
  salesProfile: Record<string, unknown> | null
  /** Texto bruto concatenado dos documentos da base escolhida (perfil, preços, cases). */
  contextText: string
}

/**
 * Persistência + tempo real do caminho quente.
 * - INSERTs usam service_role (quando configurado), escopados por parâmetros explícitos.
 * - Parciais e finais vão ao painel via Realtime Broadcast (canal por reunião) —
 *   funciona com anon key, sem tocar o Postgres a cada parcial.
 */
export class Persistence {
  private db: SupabaseClient | null
  private rt: SupabaseClient | null
  private channels = new Map<string, RealtimeChannel>()

  constructor(cfg: EngineConfig) {
    this.db =
      cfg.SUPABASE_URL && cfg.SUPABASE_SERVICE_ROLE_KEY
        ? createClient(cfg.SUPABASE_URL, cfg.SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false },
          })
        : null

    const rtKey = cfg.SUPABASE_SERVICE_ROLE_KEY ?? cfg.SUPABASE_ANON_KEY
    this.rt =
      cfg.SUPABASE_URL && rtKey
        ? createClient(cfg.SUPABASE_URL, rtKey, { auth: { persistSession: false } })
        : null
  }

  async insertSegment(
    workspaceId: string,
    meetingId: string,
    seg: TranscriptSegmentInput,
    seq: number,
  ): Promise<ModuleOutput<void>> {
    if (!this.db) {
      console.log(`[log-only] ${meetingId} #${seq} ${seg.speakerLabel}: ${seg.text}`)
      return ok(undefined)
    }
    const { error } = await this.db.from('transcript_segments').insert({
      workspace_id: workspaceId,
      meeting_id: meetingId,
      speaker_label: seg.speakerLabel,
      started_ms: seg.startedMs,
      ended_ms: seg.endedMs,
      text: seg.text,
      seq,
    })
    if (error) return err('DB_INSERT_SEGMENT', error.message)
    return ok(undefined)
  }

  /** Canal Broadcast por reunião (lazy). Nome não-adivinhável: uuid da meeting. */
  private channelFor(meetingId: string): RealtimeChannel | null {
    if (!this.rt) return null
    let ch = this.channels.get(meetingId)
    if (!ch) {
      ch = this.rt.channel(`meeting:${meetingId}`, { config: { broadcast: { self: false } } })
      ch.subscribe()
      this.channels.set(meetingId, ch)
    }
    return ch
  }

  /** Publica segmento (parcial ou final) para o painel ao vivo. Fail-soft. */
  async publishSegment(
    meetingId: string,
    seg: TranscriptSegmentInput,
    seq: number | null,
  ): Promise<void> {
    const ch = this.channelFor(meetingId)
    if (!ch) return
    try {
      await ch.send({
        type: 'broadcast',
        event: 'segment',
        payload: {
          speaker: seg.speakerLabel,
          text: seg.text,
          isFinal: seg.isFinal,
          seq,
          ts: Date.now(),
        },
      })
    } catch (e) {
      console.error(`[realtime ${meetingId}] broadcast falhou:`, e)
    }
  }

  /** Carrega o contexto do copiloto: clone ativo + perfil de vendas + docs da base. */
  async loadContext(workspaceId: string, meetingId: string): Promise<CopilotContext> {
    const empty: CopilotContext = { expertStyle: null, expertName: null, salesProfile: null, contextText: '' }
    if (!this.db) return empty

    const { data: meeting } = await this.db
      .from('meetings')
      .select('settings')
      .eq('id', meetingId)
      .single()
    const meetingSettings = (meeting?.settings ?? {}) as { context_base_id?: string }

    const { data: ws } = await this.db
      .from('workspaces')
      .select('settings')
      .eq('id', workspaceId)
      .single()
    const wsSettings = (ws?.settings ?? {}) as {
      default_expert_id?: string
      sales_profile?: Record<string, unknown>
    }

    let expertStyle: string | null = null
    let expertName: string | null = null
    if (wsSettings.default_expert_id) {
      const { data: expert } = await this.db
        .from('sales_experts')
        .select('name, style_prompt')
        .eq('id', wsSettings.default_expert_id)
        .single()
      expertStyle = expert?.style_prompt ?? null
      expertName = expert?.name ?? null
    }

    let contextText = ''
    const baseId = meetingSettings.context_base_id
    if (baseId) {
      const { data: docs } = await this.db
        .from('documents')
        .select('title, source_url, meta')
        .eq('workspace_id', workspaceId)
        .eq('context_base_id', baseId)
        .limit(30)
      contextText = (docs ?? [])
        .map((d) => {
          const raw = (d.meta as { raw_text?: string } | null)?.raw_text
          return `## ${d.title}${d.source_url ? ` (${d.source_url})` : ''}\n${raw ?? ''}`.trim()
        })
        .filter(Boolean)
        .join('\n\n')
        .slice(0, 8000)
    }

    return { expertStyle, expertName, salesProfile: wsSettings.sales_profile ?? null, contextText }
  }

  /** Persiste uma sugestão gerada e publica no painel ao vivo. Retorna o id. */
  async insertSuggestion(
    workspaceId: string,
    meetingId: string,
    sug: GeneratedSuggestion,
    meta: { model: string; tokensIn: number; tokensOut: number },
  ): Promise<ModuleOutput<string>> {
    if (!this.db) {
      console.log(`[log-only] sugestão(${sug.kind}) ${meetingId}: ${sug.content}`)
      await this.broadcastSuggestion(meetingId, { id: `local-${Date.now()}`, ...sug })
      return ok('local')
    }
    const { data, error } = await this.db
      .from('suggestions')
      .insert({
        workspace_id: workspaceId,
        meeting_id: meetingId,
        kind: sug.kind,
        content: sug.content,
        rationale: sug.rationale ?? null,
        context_refs: sug.contextRefs,
        model: meta.model,
        tokens_in: meta.tokensIn,
        tokens_out: meta.tokensOut,
      })
      .select('id')
      .single()
    if (error || !data) return err('DB_INSERT_SUGGESTION', error?.message ?? 'insert falhou')

    await this.broadcastSuggestion(meetingId, { id: data.id, ...sug })
    return ok(data.id)
  }

  private async broadcastSuggestion(
    meetingId: string,
    payload: GeneratedSuggestion & { id: string },
  ): Promise<void> {
    const ch = this.channelFor(meetingId)
    if (!ch) return
    try {
      await ch.send({ type: 'broadcast', event: 'suggestion', payload: { ...payload, ts: Date.now() } })
    } catch (e) {
      console.error(`[realtime ${meetingId}] broadcast sugestão falhou:`, e)
    }
  }

  get hasDb(): boolean {
    return this.db !== null
  }

  /** Transcrição completa da reunião, formatada para prompt. */
  async loadTranscript(meetingId: string): Promise<string> {
    if (!this.db) return ''
    const { data } = await this.db
      .from('transcript_segments')
      .select('speaker_label, text')
      .eq('meeting_id', meetingId)
      .order('seq')
      .limit(2000)
    return (data ?? []).map((s) => `${s.speaker_label ?? 'Participante'}: ${s.text}`).join('\n')
  }

  async saveReport(workspaceId: string, meetingId: string, report: Report): Promise<ModuleOutput<void>> {
    if (!this.db) return ok(undefined)
    const { error } = await this.db.from('reports').upsert(
      {
        workspace_id: workspaceId,
        meeting_id: meetingId,
        summary: report.summary,
        decisions: report.decisions,
        action_items: report.actionItems,
        red_flags: report.redFlags,
        objections: report.objections,
        next_steps: report.nextSteps,
      },
      { onConflict: 'meeting_id' },
    )
    if (error) return err('DB_SAVE_REPORT', error.message)
    return ok(undefined)
  }

  async insertProposal(
    workspaceId: string,
    meetingId: string,
    slug: string,
    title: string,
    clientName: string | null,
    content: unknown,
  ): Promise<ModuleOutput<void>> {
    if (!this.db) return err('DB_OFF', 'sem service key')
    const { error } = await this.db.from('proposals').insert({
      workspace_id: workspaceId,
      meeting_id: meetingId,
      slug,
      title,
      client_name: clientName,
      status: 'published',
      published_at: new Date().toISOString(),
      content,
    })
    if (error) return err('DB_INSERT_PROPOSAL', error.message)
    return ok(undefined)
  }

  /** Broadcast genérico no canal da reunião (report/proposal/etc). Fail-soft. */
  async broadcastEvent(meetingId: string, event: string, payload: unknown): Promise<void> {
    const ch = this.channelFor(meetingId)
    if (!ch) return
    try {
      await ch.send({ type: 'broadcast', event, payload })
    } catch (e) {
      console.error(`[realtime ${meetingId}] broadcast ${event} falhou:`, e)
    }
  }

  closeChannel(meetingId: string): void {
    const ch = this.channels.get(meetingId)
    if (ch) {
      void ch.unsubscribe()
      this.channels.delete(meetingId)
    }
  }
}
