import { createClient, type SupabaseClient, type RealtimeChannel } from '@supabase/supabase-js'
import { ok, err, type ModuleOutput, type TranscriptSegmentInput } from '@meet-copilot/shared'
import type { EngineConfig } from '../config'

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

  closeChannel(meetingId: string): void {
    const ch = this.channels.get(meetingId)
    if (ch) {
      void ch.unsubscribe()
      this.channels.delete(meetingId)
    }
  }
}
