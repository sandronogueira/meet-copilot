import { createClient, type SupabaseClient, type RealtimeChannel } from '@supabase/supabase-js'
import {
  ok,
  err,
  type ModuleOutput,
  type TranscriptSegmentInput,
  type GeneratedSuggestion,
  type Report,
  type LlmPhase,
  type LlmProvider,
  type LlmUsageByRole,
  type CopilotLlmConfig,
  copilotLlmConfigSchema,
} from '@meet-copilot/shared'
import type { EngineConfig } from '../config'
import type { BufferedSegment } from '../session/TranscriptBuffer'
import { estimateCents } from './llm-router'
import { decryptLlmKey } from './llm-key-crypto'

/** Contexto do copiloto para uma reunião (o QUE o agente sabe + COMO pensa). */
export interface CopilotContext {
  expertStyle: string | null
  expertName: string | null
  /** Ritmo de sugestões do clone — calibra o TriggerEngine da sessão. */
  interruption: 'discreto' | 'moderado' | 'ativo' | null
  salesProfile: Record<string, unknown> | null
  /** Texto bruto concatenado dos documentos da base escolhida (perfil, preços, cases). */
  contextText: string
}

/** Resumo de um clone para o seletor do painel. */
export interface ExpertSummary {
  id: string
  name: string
  tagline: string | null
  category: string | null
}

/** Chave de IA do CLIENTE já aberta, e de qual workspace ela é (o próprio ou o da equipe). */
export interface ClientLlmKey {
  apiKey: string
  ownerWorkspaceId: string
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
  /** Segredo de onde sai a chave que abre as chaves de IA dos clientes (ver llm-key-crypto). */
  private readonly keySecret: string
  /** Cache curto por workspace: evita uma consulta ao banco a cada tick ao vivo. */
  private clientKeyCache = new Map<string, { value: ClientLlmKey | null; expires: number }>()

  constructor(cfg: EngineConfig) {
    this.keySecret = cfg.ENGINE_WS_SECRET
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

  /**
   * Canal Broadcast por reunião (lazy). Nome não-adivinhável: uuid da meeting.
   * httpSend() é REST puro (não precisa de subscribe/WS) — menos conexões
   * penduradas no engine. Mantemos o Map só como cache do objeto do canal.
   */
  private channelFor(meetingId: string): RealtimeChannel | null {
    if (!this.rt) return null
    let ch = this.channels.get(meetingId)
    if (!ch) {
      ch = this.rt.channel(`meeting:${meetingId}`, { config: { broadcast: { self: false } } })
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
      const res = await ch.httpSend('segment', {
        speaker: seg.speakerLabel,
        text: seg.text,
        isFinal: seg.isFinal,
        seq,
        ts: Date.now(),
      })
      if (!res.success) console.error(`[realtime ${meetingId}] broadcast falhou:`, res.error)
    } catch (e) {
      console.error(`[realtime ${meetingId}] broadcast falhou:`, e)
    }
  }

  /** Carrega o contexto do copiloto: clone ativo + perfil de vendas + docs da base. */
  async loadContext(workspaceId: string, meetingId: string): Promise<CopilotContext> {
    const empty: CopilotContext = {
      expertStyle: null,
      expertName: null,
      interruption: null,
      salesProfile: null,
      contextText: '',
    }
    if (!this.db) return empty

    const { data: meeting } = await this.db
      .from('meetings')
      .select('settings')
      .eq('id', meetingId)
      .single()
    const meetingSettings = (meeting?.settings ?? {}) as {
      context_base_id?: string
      quick_context?: string
    }

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
    let interruption: CopilotContext['interruption'] = null
    if (wsSettings.default_expert_id) {
      const { data: expert } = await this.db
        .from('sales_experts')
        .select('name, style_prompt, interruption')
        .eq('id', wsSettings.default_expert_id)
        .single()
      expertStyle = expert?.style_prompt ?? null
      expertName = expert?.name ?? null
      const lvl = expert?.interruption as string | null
      interruption = lvl === 'discreto' || lvl === 'moderado' || lvl === 'ativo' ? lvl : null
    }

    let baseText = ''
    const baseId = meetingSettings.context_base_id
    if (baseId) {
      const { data: docs } = await this.db
        .from('documents')
        .select('title, source_url, meta')
        .eq('workspace_id', workspaceId)
        .eq('context_base_id', baseId)
        .limit(30)
      baseText = (docs ?? [])
        .map((d) => {
          const raw = (d.meta as { raw_text?: string } | null)?.raw_text
          return `## ${d.title}${d.source_url ? ` (${d.source_url})` : ''}\n${raw ?? ''}`.trim()
        })
        .filter(Boolean)
        .join('\n\n')
    }

    // Contexto rápido digitado ao iniciar a reunião — prioridade sobre a base
    // (é o que o usuário quis dizer "de cara" para ESTA conversa).
    const quick = meetingSettings.quick_context?.trim()
    const contextText = [
      quick ? `## Contexto desta reunião (informado ao iniciar)\n${quick}` : '',
      baseText,
    ]
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 9000)

    return {
      expertStyle,
      expertName,
      interruption,
      salesProfile: wsSettings.sales_profile ?? null,
      contextText,
    }
  }

  /** Clones disponíveis para o workspace (globais + próprios) e qual está ativo. */
  async listExperts(
    workspaceId: string,
  ): Promise<ModuleOutput<{ experts: ExpertSummary[]; activeId: string | null }>> {
    if (!this.db) return err('DB_OFF', 'sem service key')
    const [expertsResult, wsSettings] = await Promise.all([
      this.db
        .from('sales_experts')
        .select('id, name, tagline, category')
        .eq('status', 'active')
        .or(`scope.eq.global,workspace_id.eq.${workspaceId}`)
        .order('scope', { ascending: false })
        .order('created_at'),
      this.getWorkspaceSettings(workspaceId),
    ])
    if (expertsResult.error) return err('DB_LIST_EXPERTS', expertsResult.error.message)
    // respeita clones nativos ocultos por este workspace
    const hidden = new Set(wsSettings.hidden_expert_ids ?? [])
    const experts = ((expertsResult.data ?? []) as ExpertSummary[]).filter((e) => !hidden.has(e.id))
    return ok({ experts, activeId: wsSettings.default_expert_id ?? null })
  }

  private async getWorkspaceSettings(
    workspaceId: string,
  ): Promise<{ default_expert_id?: string; hidden_expert_ids?: string[] }> {
    if (!this.db) return {}
    const { data } = await this.db.from('workspaces').select('settings').eq('id', workspaceId).single()
    return (data?.settings ?? {}) as { default_expert_id?: string; hidden_expert_ids?: string[] }
  }

  /** Troca o clone ativo do workspace (validando que ele é global ou do próprio tenant). */
  async setActiveExpert(
    workspaceId: string,
    expertId: string,
  ): Promise<ModuleOutput<{ id: string; name: string }>> {
    if (!this.db) return err('DB_OFF', 'sem service key')
    const { data: expert } = await this.db
      .from('sales_experts')
      .select('id, name, scope, workspace_id')
      .eq('id', expertId)
      .eq('status', 'active')
      .single()
    if (!expert || (expert.scope !== 'global' && expert.workspace_id !== workspaceId)) {
      return err('EXPERT_NOT_FOUND', 'Clone não encontrado para este workspace')
    }
    const { data: ws } = await this.db.from('workspaces').select('settings').eq('id', workspaceId).single()
    const settings = {
      ...((ws?.settings ?? {}) as Record<string, unknown>),
      default_expert_id: expertId,
    }
    const { error } = await this.db.from('workspaces').update({ settings }).eq('id', workspaceId)
    if (error) return err('DB_SET_EXPERT', error.message)
    return ok({ id: expert.id as string, name: expert.name as string })
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
      const res = await ch.httpSend('suggestion', { ...payload, ts: Date.now() })
      if (!res.success) console.error(`[realtime ${meetingId}] broadcast sugestão falhou:`, res.error)
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
      const res = await ch.httpSend(event, payload)
      if (!res.success) console.error(`[realtime ${meetingId}] broadcast ${event} falhou:`, res.error)
    } catch (e) {
      console.error(`[realtime ${meetingId}] broadcast ${event} falhou:`, e)
    }
  }

  /**
   * Registra uso de tokens de LLM em usage_events. FIRE-AND-FORGET: nunca lança,
   * nunca bloqueia o caller de forma crítica — chamado depois da resposta já
   * entregue ao usuário. Uma linha por role (executor/advisor) presente em usage.
   */
  async recordLlmUsage(
    workspaceId: string,
    meetingId: string | null,
    phase: LlmPhase,
    provider: LlmProvider,
    usage: LlmUsageByRole[],
    keySource: 'workspace' | 'platform' = 'platform',
  ): Promise<void> {
    if (!this.db) {
      console.log(`[log-only] llm_usage ${workspaceId} ${meetingId ?? '-'} ${phase}/${provider}:`, usage)
      return
    }
    try {
      const rows = usage.map((u) => ({
        workspace_id: workspaceId,
        meeting_id: meetingId,
        kind: 'llm_tokens' as const,
        quantity: u.tokensIn + u.tokensOut,
        unit: 'tokens',
        cost_estimate_cents: Math.round(estimateCents([u])),
        meta: {
          role: u.role,
          model: u.model,
          phase,
          provider,
          tokens_in: u.tokensIn,
          tokens_out: u.tokensOut,
          // quem pagou esta chamada: a chave do cliente ou a da plataforma
          key_source: keySource,
        },
      }))
      const { error } = await this.db.from('usage_events').insert(rows)
      if (error) console.error('[persistence] recordLlmUsage falhou:', error.message)
    } catch (e) {
      console.error('[persistence] recordLlmUsage falhou:', e instanceof Error ? e.message : e)
    }
  }

  /**
   * Config de LLM do workspace para uma fase (pre_call|live|post_call). `maybeSingle()`
   * (não `.single()`) porque a ausência de linha é o caso normal (workspace sem config
   * customizada) — não deve logar erro. Fail-soft: qualquer problema (query ou validação
   * Zod) retorna null e o caller cai no default (`defaultLlmConfig`).
   */
  async loadLlmConfig(workspaceId: string, phase: LlmPhase): Promise<CopilotLlmConfig | null> {
    if (!this.db) return null
    const { data, error } = await this.db
      .from('copilot_llm_config')
      .select(
        'id, workspace_id, phase, provider, executor_model, advisor_enabled, advisor_model, advisor_max_uses, advisor_max_tokens',
      )
      .eq('workspace_id', workspaceId)
      .eq('phase', phase)
      .maybeSingle()
    if (error) {
      console.warn('[persistence] loadLlmConfig falhou:', error.message)
      return null
    }
    if (!data) return null

    const parsed = copilotLlmConfigSchema.safeParse({
      id: data.id,
      workspaceId: data.workspace_id,
      phase: data.phase,
      provider: data.provider,
      executorModel: data.executor_model,
      advisorEnabled: data.advisor_enabled,
      advisorModel: data.advisor_model,
      advisorMaxUses: data.advisor_max_uses,
      advisorMaxTokens: data.advisor_max_tokens,
    })
    if (!parsed.success) {
      console.warn('[persistence] loadLlmConfig: config inválida no banco, caindo no default:', parsed.error.issues.slice(0, 3))
      return null
    }
    return parsed.data
  }

  /**
   * Chave de IA do CLIENTE para este workspace: a própria, ou a da equipe a que
   * ele foi ligado no backoffice. null = usar a chave da plataforma.
   * Fail-soft: qualquer problema (tabela ausente, texto que não abre) vira null.
   */
  async resolveClientLlmKey(workspaceId: string): Promise<ClientLlmKey | null> {
    if (!this.db) return null
    const cached = this.clientKeyCache.get(workspaceId)
    if (cached && cached.expires > Date.now()) return cached.value
    const value = await this.loadClientLlmKey(workspaceId)
    this.clientKeyCache.set(workspaceId, { value, expires: Date.now() + 60_000 })
    return value
  }

  private async loadClientLlmKey(workspaceId: string): Promise<ClientLlmKey | null> {
    const own = await this.readLlmKeyRow(workspaceId)
    if (!own) return null
    // ligado à chave de uma equipe: vale a linha do dono (um salto só, sem cadeia)
    const ownerId = own.source_workspace_id ?? workspaceId
    const row = own.source_workspace_id ? await this.readLlmKeyRow(ownerId) : own
    if (!row?.key_ciphertext || row.status !== 'active') return null
    const apiKey = decryptLlmKey(row.key_ciphertext, ownerId, this.keySecret)
    if (!apiKey) {
      console.warn(`[persistence] a chave de IA do workspace ${ownerId} não abriu (segredo trocado?)`)
      return null
    }
    return { apiKey, ownerWorkspaceId: ownerId }
  }

  private async readLlmKeyRow(
    workspaceId: string,
  ): Promise<{ key_ciphertext: string | null; source_workspace_id: string | null; status: string } | null> {
    if (!this.db) return null
    const { data, error } = await this.db
      .from('workspace_llm_keys')
      .select('key_ciphertext, source_workspace_id, status')
      .eq('workspace_id', workspaceId)
      .maybeSingle()
    if (error) {
      console.warn('[persistence] workspace_llm_keys:', error.message)
      return null
    }
    return data
  }

  /** A IA recusou a chave do cliente: marca como inválida (a tela avisa o dono) e para de usá-la. */
  async markClientLlmKeyInvalid(ownerWorkspaceId: string, reason: string): Promise<void> {
    this.clientKeyCache.clear()
    if (!this.db) return
    const { error } = await this.db
      .from('workspace_llm_keys')
      .update({ status: 'invalid', last_error: reason })
      .eq('workspace_id', ownerWorkspaceId)
    if (error) console.error('[persistence] markClientLlmKeyInvalid falhou:', error.message)
  }

  closeChannel(meetingId: string): void {
    const ch = this.channels.get(meetingId)
    if (ch) {
      void ch.unsubscribe()
      this.channels.delete(meetingId)
    }
  }

  /** Encerra a reunião (fim de ciclo de vida): status done + ended_at. Fail-soft. */
  async endMeeting(meetingId: string): Promise<ModuleOutput<void>> {
    if (!this.db) return ok(undefined)
    const { error } = await this.db
      .from('meetings')
      .update({ status: 'done', ended_at: new Date().toISOString() })
      .eq('id', meetingId)
      .eq('status', 'in_call')
    if (error) return err('DB_END_MEETING', error.message)
    return ok(undefined)
  }

  /**
   * Últimos N segmentos finais persistidos, em ordem crescente de seq —
   * usado para reidratar o TranscriptBuffer em memória após restart/deploy.
   */
  async loadRecentSegments(meetingId: string, limit = 40): Promise<BufferedSegment[]> {
    if (!this.db) return []
    const { data, error } = await this.db
      .from('transcript_segments')
      .select('speaker_label, text, started_ms, ended_ms, seq')
      .eq('meeting_id', meetingId)
      .order('seq', { ascending: false })
      .limit(limit)
    if (error) {
      // silêncio aqui escondia falha de reidratação pós-restart (achado do QA)
      console.error('[persistence] loadRecentSegments falhou:', error.message)
      return []
    }
    if (!data) return []
    return data
      .slice()
      .reverse()
      .map((s) => ({
        speakerLabel: s.speaker_label ?? 'Participante',
        text: s.text,
        startedMs: s.started_ms,
        endedMs: s.ended_ms,
        isFinal: true,
        seq: s.seq,
      }))
  }
}
