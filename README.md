# Meet Copilot

> **Entre na reunião sem saber nada e saia como especialista.**

Copiloto de IA para reuniões de vendas/consultoria: um bot entra na reunião (Meet/Zoom/Teams), transcreve ao vivo e alimenta um painel "war room" com **sugestões de perguntas inteligentes**, **fact-check do que os participantes afirmam** e o botão **"Gerar Proposta Comercial"** — proposta dark premium publicada em página própria durante ou logo após a reunião.

- Domínio: `meetcopilot.com.br` (reservar também `.io`)
- Arquitetura completa: [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md)

## Estrutura do monorepo

```
apps/web/                  # Next.js (Vercel) — painel, auth, propostas públicas /p/[slug]
services/meeting-engine/   # Node 22 (Docker/EasyPanel) — caminho quente do tempo real (WS do Recall)
packages/shared/           # Contratos Zod + envelope ModuleOutput<T> compartilhados
supabase/migrations/       # Schema Postgres + RLS multi-tenant + pgvector
```

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend/API | Next.js 15 (App Router) na Vercel |
| Tempo real | Serviço Node próprio (`meeting-engine`) via WSS + Supabase Realtime |
| Dados | Supabase `sa-east-1` — Postgres + RLS, pgvector, Storage, Auth |
| Bot de reunião | Recall.ai Meeting Bot API (transcrição streaming com Deepgram) |
| IA | Claude API — Haiku (router) / Sonnet (gerador, fact-check) / Opus (propostas) |

## Setup

```bash
bun install               # ou npm install
bun run typecheck

# Web
cp apps/web/.env.example apps/web/.env.local
bun run dev:web

# Engine
cp services/meeting-engine/.env.example services/meeting-engine/.env
bun run dev:engine
```

Banco: criar projeto Supabase (região `sa-east-1`) e aplicar `supabase/migrations/0001_core_schema.sql` (via `supabase db push` ou SQL editor).

## Fases (critérios de pronto em docs/ARQUITETURA.md §7)

- [x] **F0 — Fundação**: monorepo, schema+RLS, contratos, skeletons, CI
- [ ] **F1 — Bot + transcrição ao vivo**
- [ ] **F2 — Base de Contexto + RAG**
- [ ] **F3 — Copiloto (sugestões em tempo real)**
- [ ] **F4 — Fact-check**
- [ ] **F5 — Relatório pós-reunião**
- [ ] **F6 — Propostas (estilo sofia.2020agency.co)**
- [ ] **F7 — Billing + hardening LGPD**

## Princípios (herdados do ecossistema)

- **Determinístico antes de LLM** — filtros e triggers são `if`; IA só onde gera valor
- **Transcrição é input não confiável** — fencing rígido contra prompt injection via fala
- **LLM nunca inventa preço** — valores de proposta vêm só da tabela oficial do workspace
- **LGPD como pilar** — bot se anuncia, retenção configurável, purge real de mídia
- **Custo medido por reunião** (`usage_events`) com circuit breaker
