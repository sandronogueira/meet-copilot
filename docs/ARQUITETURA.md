# Meet Copilot — Arquitetura v1

> Slogan: **"Entre na reunião sem saber nada e saia como especialista."**
> Decisões estratégicas: bot via Recall.ai + web app · MVP tempo real completo · Next.js + Supabase · BR primeiro (LGPD como pilar).
> Domínio: `meetcopilot.com.br` (reservar `.io`). ⚠️ `.com/.ai/.app` têm dono — e "Copilot" é marca associada à Microsoft: validar INPI antes de investir pesado na marca.

## 1. Visão de peças

| Peça | Onde | Papel |
|---|---|---|
| `apps/web` | Vercel | Painel "war room", auth, CRUD, propostas públicas `/p/[slug]`, webhooks de status |
| `services/meeting-engine` | Docker no VPS/EasyPanel (`engine.meetcopilot.com.br`) | Caminho quente: recebe WSS do Recall, buffer, triggers, pipeline de IA, persistência |
| Supabase `sa-east-1` | — | Postgres+RLS multi-tenant, pgvector (RAG), Realtime (painel ao vivo), Storage, Auth |
| Recall.ai | SaaS | Bot entra em Meet/Zoom/Teams, grava e transcreve (Deepgram streaming PT-BR) |
| Claude API | SaaS | Haiku = router barato · Sonnet = sugestões/fact-check · Opus = propostas/relatório |

**Por que o engine não roda na Vercel:** Vercel não aceita WebSocket *inbound* (o Recall precisa empurrar o stream para um endpoint nosso) e o estado da sessão (buffer, timers) precisa viver num processo persistente. Plano B documentado: Cloudflare Durable Objects.

## 2. Fluxo tempo real

```
Meet/Zoom/Teams ← bot "… — Assistente IA (gravando)"
      │
  Recall.ai ──status webhooks (Svix)──▶ apps/web /api/webhooks/recall
      │ realtime_endpoints (WSS ?token=JWT): transcript.partial_data / transcript.data
      ▼
meeting-engine — 1 ator por reunião
  ├─ TranscriptBuffer: janela deslizante + detecção de turno (speaker/gap 2s)
  ├─ TriggerEngine: T1 turno ≥40 palavras · T2 timer 25s · T3 manual · cooldown 10s
  │   (nunca dispara enquanto o próprio usuário fala)
  ├─ Router Haiku (JSON estrito): vale sugestão? claims? tópico novo?  ~70% morre aqui
  ├─ Gerador Sonnet + RAG (match_chunks, prompt caching, anti-repetição)
  ├─ FactCheckService: fila assíncrona, dedupe por embedding, máx ~8/h
  └─ INSERTs finais no Postgres
      │ Broadcast (parciais, efêmero)     │ postgres_changes (finais, herda RLS)
      ▼                                   ▼
              Painel "War Room" (transcrição, sugestões, fact-checks,
              botão "Gerar Proposta")
```

**Latência alvo:** parcial < 1,5s · sugestão < 15s · fact-check < 25s.

## 3. Custo por hora de reunião (medir em `usage_events` desde o dia 1)

| Componente | Custo/h |
|---|---|
| Router Haiku (~100 ticks) | ~US$0,29 |
| Gerador Sonnet (~20 chamadas, prefixo cacheado) | ~US$0,35 |
| Fact-check (~6 checks + web_search) | ~US$0,22 |
| Relatório pós | ~US$0,08 |
| Recall bot + STT | US$0,65–0,96 |
| **Total** | **≈ US$1,55–2,00/h (~R$8–11/h)** |

Proposta (Opus, 2 passos): ~US$0,40. **Circuit breaker por reunião** (teto ex.: US$2 → degrada para modo manual).

## 4. Fact-check — regras de produto

1. Claims só de **terceiros** (nunca do usuário); opinião/futuro não são checáveis.
2. Dedupe (cosine > 0,88 + hash por workspace) e orçamento (~8/h, prioridade por materialidade).
3. **Sem fonte ⇒ `unverified` forçado pelo schema** (não confiamos no modelo).
4. Vocabulário fixo da UI: "Confirmado por fontes / Parcialmente confirmado / Não encontrei fontes / Fontes divergem". Nunca "falso/mentira".

## 5. Propostas (estilo sofia.2020agency.co)

Template JSON por workspace (11 tipos de seção) + `MeetingFacts` (extração Opus) + geração Opus → `ProposalContent` validado por Zod. **Preços só da tabela oficial** (`validatePricesAgainstOfficial` — o LLM escolhe pacotes, não inventa números). Fluxo: gerar → **revisão humana por seção** → publicar `/p/[slug]` (slug não-adivinhável, senha/expiração opcionais, `noindex`). PDF via Playwright no engine.

## 6. Segurança & LGPD (resumo operacional)

- **RLS em tudo** (`workspace_id` + `app.is_member/is_admin`); escritas do caminho quente só via service_role escopado; página pública lê via `app.get_published_proposal` (security definer)
- **Consentimento:** bot_name anuncia gravação (não desligável no MVP), anúncio no chat, registro em `meetings.consent` + `audit_logs`
- **Retenção:** `retention_days` por workspace → job diário purga mídia no Recall + Storage + segments (`media_deleted_at`)
- **Prompt injection via fala:** transcrição/busca = dados não confiáveis, sempre delimitados; saídas 100% structured output + Zod
- **Webhooks** Svix-verificados; WS com JWT curto por reunião; api_keys com hash; rate limiting; logging sem PII
- Titular: export + deleção sob demanda; RIPD/DPIA; suboperadores documentados (Recall, Anthropic, Deepgram, Vercel, Supabase)

## 7. Fases e critérios de pronto

| Fase | Critério de "pronto" |
|---|---|
| **F0 Fundação** ✅ | Monorepo + schema/RLS + contratos + skeletons + CI. Pendências F0: auth Supabase nas rotas (`TODO(F0-auth)` — BLOQUEANTE p/ deploy), teste automatizado de RLS |
| **F1 Bot + live** | Reunião real com transcrição PT-BR < 2s; reconexão sem perda; decisão STT validada |
| **F2 RAG** | Golden set 20 queries ok; zero vazamento entre tenants |
| **F3 Copiloto** | ≥50% sugestões úteis em 3 pilotos; custo ≤ US$1,20/h; zero repetição |
| **F4 Fact-check** | 10 claims plantados: ≥8 corretos, opiniões ignoradas, tudo com fonte |
| **F5 Relatório** | E-mail < 5min pós-reunião com conteúdo correto |
| **F6 Propostas** | Página comparável à sofia; LLM nunca inventa preço (teste) |
| **F7 Billing/LGPD-ops** | Purge comprovado nas 3 camadas; export titular; 10 reuniões simultâneas |

## 8. Riscos top-5

1. **Dependência Recall.ai** → interface `MeetingBotProvider` + fallback upload de áudio
2. **STT PT-BR/diarização** → piloto comparativo F1 + keyword boost
3. **Custo LLM** → router barato, caching, teto/reunião
4. **VPS ponto único de falha** → healthcheck/restart, sessão re-hidratável, plano B Durable Objects
5. **Cache de prompt invalidado** (custo 10×) → prefixos congelados, monitorar `cache_read_input_tokens`

---
*Plano estratégico completo (naming, posicionamento, monetização): sessão Claude de 2026-07-05.*
