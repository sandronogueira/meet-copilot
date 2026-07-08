# Quality Scorecard — Meet Copilot

**Autor:** Quinn (QA) · **Data:** 2026-07-08 · **Protocolo:** Evidence-First Verification
**Sistema avaliado:** `apps/web` (https://meet.2020agency.co) · `services/meeting-engine` (https://agencia2020-meet-copilot-engine.ocgogh.easypanel.host) · Supabase `eckpokmvahywcnmipgnv`

Todas as evidências abaixo foram coletadas ao vivo (curl em produção, SQL direto no Postgres via MCP, leitura de código-fonte). Nenhum código de produto foi alterado. Dados de teste (`qa-iso-a@2020agency.co`, `qa-iso-b@2020agency.co`) foram criados, usados e **removidos com prova de resíduo zero** (seção 2).

---

## Tabela-resumo

| # | Dimensão | Gate | Evidência-chave |
|---|----------|------|------------------|
| 1 | Segurança de acesso | **PASS** | `/app/*` sem sessão → 307→/login; `/backoffice` sem sessão → 404; `/api/*` sem sessão → 401; RPCs de backoffice negadas a `anon`/`authenticated`; engine com token inválido → 403 em 7/7 rotas testadas |
| 2 | Isolamento multi-tenant | **PASS** | 2 usuários reais criados, 0 linhas cruzadas em `meetings`/`context_bases`/`suggestions` (nas duas direções + contra o workspace real do Sandro), UPDATE cross-tenant afetou 0 linhas, limpeza com resíduo zero comprovado |
| 3 | Falhas silenciosas | **CONCERNS** | Webhook do Recall retorna HTTP 500 em produção (achado HIGH); 2 padrões de catch sem log (audit_logs, reidratação de segmentos) |
| 4 | Confiabilidade do engine | **PASS** (com ressalva) | Watchdog (90s), sweeper (60s/30min), reidratação e timeout de 30s no Anthropic todos confirmados no código; ressalva: essas proteções só cobrem sessões vivas na memória do processo atual |
| 5 | Higiene de dados | **CONCERNS** | 11/41 meetings (27%) travadas em `joining` há 1-3 dias, 1 travada em `in_call` há 7h; 0 órfãos de FK; fila `jobs` declarada mas nunca usada (0 linhas, TODO não implementado) |

**Veredito geral: CONCERNS — ver seção final.**

---

## 1. Segurança de acesso — PASS

### 1.1 Rotas do app sem sessão

```
curl -sS -o /dev/null -w "HTTP %{http_code} -> %{redirect_url}\n" https://meet.2020agency.co/app/meetings
→ HTTP 307 -> https://meet.2020agency.co/login?next=%2Fapp%2Fmeetings

curl -sS -o /dev/null -w "HTTP %{http_code}\n" https://meet.2020agency.co/backoffice
→ HTTP 404

curl -sS -o /dev/null -w "HTTP %{http_code}\n" https://meet.2020agency.co/
→ HTTP 200 (público, esperado)
```

Mecanismo: `apps/web/src/middleware.ts` protege `/app/:path*` e `/onboarding/:path*` via `supabase.auth.getUser()` + redirect (linhas 6, 39-44). `/backoffice` **não está no matcher do middleware** — a proteção é feita no server component `apps/web/src/app/backoffice/layout.tsx:6` via `requireSuperadmin()`, que chama `notFound()` (404, não revela a existência da rota) quando não há usuário OU o e-mail não está na allowlist `SUPERADMIN_EMAILS` (`apps/web/src/lib/superadmin.ts:20-31`). Testei apenas o caminho "sem sessão"; o caminho "sessão válida mas e-mail fora da allowlist" não foi testado ao vivo (exigiria um 2º usuário autenticado real via browser) — a lógica de código está correta e revisada, mas fica como gap de cobertura declarado.

### 1.2 Rotas de API (Next.js Route Handlers) sem sessão

Nenhuma dessas rotas está no matcher do middleware — cada uma faz seu próprio `supabase.auth.getUser()`:

```
curl -X POST https://meet.2020agency.co/api/extension/start   → HTTP 401
curl -X POST https://meet.2020agency.co/api/meetings          → HTTP 401
curl        https://meet.2020agency.co/api/extension/bootstrap → HTTP 401
```

Confirmado em código: `apps/web/src/app/api/meetings/route.ts:28`, `apps/web/src/app/api/extension/start/route.ts:16`, `apps/web/src/app/api/extension/bootstrap/route.ts:15` (idêntico padrão `if (!user) return 401`).

### 1.3 RPCs de backoffice — privilégio de execução

```sql
select proname, has_function_privilege('anon', oid, 'EXECUTE') anon_exec,
       has_function_privilege('authenticated', oid, 'EXECUTE') authenticated_exec,
       has_function_privilege('service_role', oid, 'EXECUTE') service_role_exec
from pg_proc where proname in ('backoffice_overview','backoffice_platform_stats');
```
→ `backoffice_overview`: anon=false, authenticated=false, service_role=true
→ `backoffice_platform_stats`: anon=false, authenticated=false, service_role=true

Confirma `supabase/migrations/0009_backoffice.sql:40,57` (`revoke execute ... from public, anon, authenticated`) está de fato aplicado em produção — não é só intenção no arquivo de migração.

**Achado LOW (hardening, não vulnerabilidade):** `public.list_meetings_overview` (migração `0008_meetings_overview.sql:43`) está `grant`ada para `authenticated` mas também aparece com `anon_exec: true` no catálogo (grant herdado de `public`). Não é explorável — a função filtra por `app.is_member(p_workspace)` que depende de `auth.uid()`, sempre nulo para `anon`, então retorna 0 linhas — mas o ideal seria revogar de `anon` explicitamente por defesa em profundidade, já que não há caso de uso legítimo de chamada anônima.

### 1.4 Engine — token inválido em todas as rotas

```
BASE=https://agencia2020-meet-copilot-engine.ocgogh.easypanel.host
/experts?token=invalid   → 403
/end   (POST, token inválido) → 403
/report (POST, token inválido) → 403
/proposal (POST, token inválido) → 403
/expert (POST, token inválido) → 403
/ingest (POST, token inválido) → 403
/stream (WS upgrade, token inválido) → 403
/does-not-exist → 404
```

7/7 rotas autenticadas rejeitaram token inválido com 403; rota inexistente devolve 404 puro (sem vazar stack trace). Mecanismo: `verifyToken()` em `services/meeting-engine/src/index.ts:34-46` usa `jwtVerify` (HS256) e retorna `null` em qualquer falha — cada handler checa `if (!claims) return 403` antes de tocar em qualquer dado.

---

## 2. Isolamento multi-tenant — PASS (a prova das "sessões individualizadas")

### Metodologia
Script node one-off (removido após a execução) rodado com `cwd` em `services/meeting-engine` para reaproveitar `@supabase/supabase-js` já instalado. Fluxo:

1. `admin.auth.admin.createUser()` para `qa-iso-a@2020agency.co` e `qa-iso-b@2020agency.co` (service role, senha forte, `email_confirm: true`) → trigger `app.handle_new_user()` (migração `0002`) cria workspace pessoal + `workspace_members` (`role='owner'`) + perfil para cada um, automaticamente.
2. `signInWithPassword()` com a **ANON key** para cada usuário → `access_token` real de sessão.
3. Chamadas REST diretas (`Authorization: Bearer <token do usuário>`, sem service role) contra `meetings`, `context_bases`, `suggestions`.
4. Tentativa de UPDATE cross-tenant.
5. Limpeza + prova de resíduo zero.

### Resultado — leitura cross-tenant

| Leitor | Tabela | Total visível | Linhas de outro workspace | Filtro explícito p/ workspace do outro teste | Filtro explícito p/ workspace REAL (Sandro) |
|---|---|---|---|---|---|
| A | meetings | 0 | 0 | 0 linhas | 0 linhas |
| A | context_bases | 1 (a própria "Base principal") | 0 | 0 linhas | 0 linhas |
| A | suggestions | 0 | 0 | 0 linhas | 0 linhas |
| B | meetings | 0 | 0 | 0 linhas | 0 linhas |
| B | context_bases | 1 (a própria) | 0 | 0 linhas | 0 linhas |
| B | suggestions | 0 | 0 | 0 linhas | 0 linhas |

Nenhum dos dois usuários viu **uma única linha** do outro tenant de teste nem do workspace real de produção (`81028b36-3cd6-4a17-a971-a2af1d9f5879`, "Agência 2020"), mesmo pedindo explicitamente por `workspace_id=eq.<outro>`. RLS (`app.is_member()`, `supabase/migrations/0001_core_schema.sql:47-56` + policies `mt_select`/`cb_all`/`sg_select`) segurou 100% das tentativas.

### Resultado — escrita cross-tenant (UPDATE)

```
A → PATCH /rest/v1/workspaces?id=eq.<workspace de B>  {name:"HACKED-BY-A"}
→ HTTP 200, 0 linhas retornadas (RLS bloqueou; PostgREST responde 200 com corpo vazio pois o UPDATE afetou 0 linhas)

A → PATCH /rest/v1/workspaces?id=eq.<workspace REAL Sandro>  {name:"HACKED-BY-A"}
→ HTTP 200, 0 linhas retornadas

Confirmação via service role (fora do RLS):
  nome atual do workspace de B: "QA Isolation B"       (inalterado)
  nome atual do workspace REAL: "Agência 2020"          (inalterado)
```

Mecanismo: policy `ws_update` (`0001_core_schema.sql:465-466`) exige `app.is_admin(id)` — A não é membro do workspace de B nem do de Sandro, então a claúsula `USING` filtra a linha antes mesmo do `UPDATE` tocar nela.

### Limpeza e prova de resíduo zero

```
deleteUser(a): OK       deleteUser(b): OK
workspace_members residuais para os 2 workspaces de teste: 0   (cascata via FK "on delete cascade" funcionou)
delete workspaces órfãos: OK (2 deletados)                      (workspaces NÃO cascateiam de auth.users — comportamento
                                                                  conhecido, documentado no schema; por isso o delete explícito)

--- Prova final ---
usuários qa-iso-* remanescentes: 0
workspaces de teste remanescentes: 0
workspace_members remanescentes: 0
```

Estado do banco após o teste: `workspaces=1, workspace_members=1, users=1` (só o tenant real do Sandro) — confirma que a plataforma hoje tem exatamente 1 tenant real e que o teste não deixou rastro.

---

## 3. Falhas silenciosas — CONCERNS

### 3.1 [HIGH] Webhook do Recall retorna 500 em produção — provável causa-raiz dos meetings zumbis (seção 5)

```
curl -X POST https://meet.2020agency.co/api/webhooks/recall \
  -H "svix-signature: v1,bogus" \
  -d '{"event":"bot.status_change","data":{"bot":{"id":"test"},"data":{"code":"in_call_recording"}}}'
→ HTTP 500
```

Arquivo: `apps/web/src/app/api/webhooks/recall/route.ts`. A rota tem duas guard clauses que retornam 500 **antes** de processar qualquer payload:
- linha 39-43: `adminEnv()` falha (env `SUPABASE_SERVICE_ROLE_KEY`/`NEXT_PUBLIC_SUPABASE_URL` ausente no deploy do `apps/web`) → 500
- linha 61-64: `webhookSecret()` (env `RECALL_WEBHOOK_SECRET`) ausente **e** `NODE_ENV === 'production'` → 500

Uma assinatura inválida em produção *deveria* retornar 401 (verificação Svix rejeitando), não 500. Receber 500 indica que uma dessas duas variáveis de ambiente não está configurada no deploy Vercel do `apps/web` (não consegui confirmar qual das duas via logs do Vercel — a tool `get_runtime_logs`/`get_runtime_errors` retornou 403 Forbidden para o projeto `prj_PMohLUDDSAGgaxLWvMcdWidbQcp5`, sem permissão de acesso nesta sessão).

**Efeito prático:** se o endpoint sempre 500 antes de verificar a assinatura, os webhooks REAIS do Recall.ai (que anunciam `joining_call → in_call_recording → done`) também nunca são processados. Isso bate exatamente com o achado da Dimensão 5: 11 meetings travadas em `joining` (8 delas já com segmentos de transcrição chegando pelo WS — ou seja, o bot funcionou, só o webhook de status é que nunca atualizou o banco). Nota de segurança: o lado bom do bug é que, por retornar 500 sempre, nenhum forjador consegue de fato injetar uma mudança de status falsa hoje (o código nunca chega no processamento) — é uma quebra de **confiabilidade**, não um buraco de **acesso**.

**Ação recomendada:** verificar/configurar `SUPABASE_SERVICE_ROLE_KEY` e `RECALL_WEBHOOK_SECRET` nas env vars de produção do projeto Vercel `web` (`prj_PMohLUDDSAGgaxLWvMcdWidbQcp5`) e reprocessar/corrigir manualmente as 12 meetings zumbis já existentes.

### 3.2 [MEDIUM] Reidratação de segmentos falha em silêncio

`services/meeting-engine/src/lib/persistence.ts:398-407` (`loadRecentSegments`):
```ts
async loadRecentSegments(meetingId: string, limit = 40): Promise<BufferedSegment[]> {
  if (!this.db) return []
  const { data, error } = await this.db.from('transcript_segments')...
  if (error || !data) return []   // <- nenhum console.error, ao contrário de TODOS os outros métodos do arquivo
  ...
}
```
Todo outro método de escrita/leitura neste mesmo arquivo (`insertSegment`, `insertSuggestion`, `saveReport`, `insertProposal`, `endMeeting`) retorna `err('CODE', error.message)` que é logado pelo chamador. Este é o único que descarta o erro completamente. Se a reidratação pós-restart falhar (ex.: rede, RLS, timeout), o operador não vai ver nada nos logs — a sessão simplesmente reabre com buffer vazio, perdendo contexto de conversa em andamento, sem nenhum rastro.

### 3.3 [MEDIUM] Falha de INSERT em `audit_logs` do backoffice é 100% silenciosa

`apps/web/src/app/backoffice/actions.ts:65,113,149,185` — as 4 ações administrativas (`createTesterAction`, `setUserBanAction`, `resetTesterPasswordAction`) fazem:
```ts
await admin.from('audit_logs').insert({...})   // resultado nunca capturado, nem error nem data
```
Se esse insert falhar (ex.: constraint, rede), a ação administrativa (criar tester, banir, resetar senha) **ainda retorna sucesso pra UI** — o operador do backoffice não tem como saber que a trilha de auditoria ficou incompleta. Esta é exatamente a mesma classe de bug que já ocorreu uma vez no projeto (policy de UPDATE ausente em `reports`, corrigida na migração `0007_reports_update_policy.sql`) — o padrão "escrita sem checar erro" se repete aqui, desta vez num RPC/insert em vez de RLS.

### 3.4 [LOW] Payload de webhook não reconhecido não deixa rastro

`apps/web/src/app/api/webhooks/recall/route.ts:67`: `if (!parsed.success) return NextResponse.json({ ok: true })` — evento com schema inesperado retorna 200 sem nenhum `console.log`/`console.error`. Combinado com o achado 3.1, se o Recall mudar o formato do payload no futuro, não haverá NENHUM sinal nos logs — nem erro, nem 200 "esperado".

### Verificação de RLS write-paths (positivo)
Cruzei todas as chamadas `.update()/.insert()/.upsert()/.delete()` do client autenticado (não-admin) em `apps/web/src` contra as policies reais do Postgres (seção completa de `pg_policies` coletada) — `meetings` (insert/update), `workspaces` (update), `context_bases`/`documents` (all), `sales_experts` (admin-write) todas têm policy correspondente. Não encontrei nenhuma outra tabela com o padrão "código escreve, RLS não permite" (a classe de bug que gerou a migração `0007`).

---

## 4. Confiabilidade do engine — PASS (com ressalva estrutural)

```
GET /health → {"ok":true,"uptimeS":14710,"sessions":0,"memMB":135,"idleMs":1800000,
                "supabase":true,"stt":"groq_whisper_large_v3","copilot":true}
```

| Proteção | Evidência | Arquivo:linha |
|---|---|---|
| Watchdog de tick preso | trava `tickingSince` liberada se >90s | `services/meeting-engine/src/session/SessionManager.ts:149-152` |
| Sweeper de sessões ociosas | `setInterval` a cada 60s, fecha sessão + `endMeeting()` após `IDLE_MS` (30min default, `SESSION_IDLE_MS` configurável) | `SessionManager.ts:190,202,205-218` |
| Reidratação pós-restart | `buffer.hydrate(segs)` carregado de `loadRecentSegments()` no `initialize()` da sessão, aguardado (`this.ready`) antes do 1º tick para evitar corrida | `SessionManager.ts:44-59,106,156` |
| Timeout de rede na IA | `AbortSignal.timeout(30_000)` no fetch pro Anthropic — evita fetch pendurado travando o tick pra sempre | `services/meeting-engine/src/lib/anthropic.ts:59` |
| Fail-soft em frame de WS | erro ao processar mensagem não derruba a conexão | `services/meeting-engine/src/index.ts:407-412` |

**Ressalva (cross-referenciada com a Dimensão 5):** watchdog e sweeper só existem **dentro do processo Node em memória** (`Map<meetingId, Session>`). Se o processo do engine reiniciar (deploy, crash, OOM) enquanto uma reunião está ativa, a sessão em memória desaparece e **nada mais** vai fechá-la — não existe um job de reconciliação em nível de banco que percorra `meetings` presas em `in_call`/`joining` há muito tempo e as feche. Isso é consistente com o meeting `c7ad15dc...` (capture_mode extension, 96 segmentos, travada em `in_call` há 7h vista na Dimensão 5) — o sweeper deveria tê-la fechado após 30 min de inatividade, mas só teria feito isso se a sessão ainda existisse na memória do processo atual.

---

## 5. Higiene de dados — CONCERNS

### Meetings por status
```
done: 27   joining: 11   failed: 2   in_call: 1     (total: 41)
```

### Meetings "zumbis" (presas há mais de 2h em joining/in_call)

12 meetings no total, todas anteriores a hoje:

| Padrão | Qtde | Detalhe |
|---|---|---|
| `joining`, capture_mode=`bot`, com `recall_bot_id` | 11 | idade de 1-3 dias; **8 delas já têm segmentos de transcrição salvos** (1 a 24 segmentos) — prova de que o bot entrou e capturou áudio, mas o status nunca avançou de `joining` → `in_call`/`done` |
| `in_call`, capture_mode=`extension`, sem `recall_bot_id` | 1 | idade de 7h, **96 segmentos** de transcrição, `started_at` nulo (esperado para capture_mode extension, que não seta `started_at` na criação — `apps/web/src/app/api/extension/start/route.ts:117`) |

Causa-raiz mais provável para as 11 de `bot`: o webhook do Recall que atualizaria o status (`apps/web/src/app/api/webhooks/recall/route.ts`) está retornando 500 em produção (achado 3.1) — o bot funciona (transcrição chega por um canal WS separado, direto pro `meeting-engine`), mas a atualização de status via webhook nunca chega ao Postgres.
Causa mais provável para a de `extension`: a sessão em memória do engine foi perdida (restart/deploy) antes do sweeper de 30 min ou do clique em "Encerrar" — ver ressalva da Dimensão 4.

### Integridade referencial (positivo)
```sql
suggestions_orfas: 0   reports_orfaos: 0   proposals_orfas: 0   segments_orfaos: 0
profiles_workspace_invalido: 0   workspaces_sem_owner: 0
```
Todas as FKs com `on delete cascade` (`meeting_id`, `workspace_id`) estão íntegras — nenhum registro órfão de reunião ou de workspace inválido.

### Fila `jobs` — infraestrutura morta
```sql
select count(*) from jobs;  → 0
```
A tabela `jobs` (`0001_core_schema.sql:350-364`, comentário "fila simples em Postgres, padrão pg_advisory_lock no worker") está com **0 linhas** — nunca foi usada. O único ponto do código que menciona enfileirar algo nela é um TODO não implementado: `apps/web/src/app/api/webhooks/recall/route.ts:81` (`// TODO(F5): status 'processing' → enfileirar job report_generate na tabela jobs`). Isso confirma que não existe hoje nenhum worker de reconciliação/backstop rodando sobre o banco — toda a "auto-cura" de sessão depende do processo do engine estar vivo (Dimensão 4).

---

## Lista de issues por severidade

| Sev. | Issue | Arquivo:linha |
|---|---|---|
| **HIGH** | Webhook do Recall retorna 500 em produção independente da assinatura (env `SUPABASE_SERVICE_ROLE_KEY` ou `RECALL_WEBHOOK_SECRET` provavelmente ausente no deploy do `apps/web`); correlaciona com 12 meetings zumbis | `apps/web/src/app/api/webhooks/recall/route.ts:39-43,61-64` |
| **MEDIUM** | 11 meetings travadas em `joining` há 1-3 dias (8 já com transcrição — só o status não avançou); 1 meeting travada em `in_call` há 7h | Dado em produção; sem código de reconciliação existente |
| **MEDIUM** | Falha de INSERT em `audit_logs` é totalmente silenciosa — ação administrativa reporta sucesso mesmo sem trilha de auditoria | `apps/web/src/app/backoffice/actions.ts:65,113,149,185` |
| **MEDIUM** | `loadRecentSegments` descarta erro de banco sem log, ao contrário de todo o resto do arquivo | `services/meeting-engine/src/lib/persistence.ts:398-407` |
| **LOW** | Payload de webhook do Recall não reconhecido retorna 200 sem nenhum log — indistinguível de operação normal | `apps/web/src/app/api/webhooks/recall/route.ts:67` |
| **LOW** | `list_meetings_overview` não é explicitamente revogada de `anon` (não explorável hoje, mas defesa em profundidade) | `supabase/migrations/0008_meetings_overview.sql:43` |
| **INFO** | `workspaces` não cascateia ao deletar o usuário dono via `auth.admin.deleteUser` — comportamento conhecido, exige delete explícito (confirmado e tratado na limpeza do teste de isolamento) | `supabase/migrations/0001_core_schema.sql:16-26` |
| **INFO** | Tabela `proposal_views` existe e tem policy de SELECT mas nenhum código insere nela — `view_count`/analytics de proposta é feature incompleta, não implementada | `supabase/migrations/0001_core_schema.sql:248-256` |
| **GAP DE COBERTURA** | Não testei "usuário autenticado mas fora da allowlist `SUPERADMIN_EMAILS` acessando `/backoffice`" com sessão real de browser — só o caminho sem sessão. Lógica de código revisada e correta. | `apps/web/src/lib/superadmin.ts:20-31` |

---

## Veredito geral

**CONCERNS.** A plataforma está **segura** — a promessa central de "sessões/dados individualizados por usuário" está **provada com teste real, nas duas direções, incluindo tentativa de escrita cross-tenant, com zero vazamento e zero resíduo de teste**. Controle de acesso (rotas, RPCs, tokens do engine) também passou em todos os 15+ pontos testados. Nenhum achado desta rodada é explorável por um tester externo mal-intencionado.

O que impede um **PASS irrestrito** é a Dimensão 5: **27% das reuniões no banco estão travadas** em status intermediário (`joining`/`in_call`) por falta de uma atualização de status que provavelmente está quebrada em produção (achado HIGH da seção 3.1) — e não existe nenhum mecanismo de reconciliação de banco para essas travas (a fila `jobs` está vazia e sem worker). Testers externos vão ver reuniões antigas presas em "Entrando..." na tela de Reuniões, e qualquer reunião nova via bot corre risco de ficar do mesmo jeito até o webhook ser corrigido.

**Recomendação:** liberar para um grupo pequeno e controlado de testers (capture_mode=extension é o fluxo mais usado e não depende do webhook quebrado) enquanto se resolve o achado HIGH (3.1) em paralelo — não é um bloqueador de segurança, é um bloqueador de qualidade de produto/primeira impressão.
