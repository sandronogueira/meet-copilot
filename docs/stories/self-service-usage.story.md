# Story: Consumo self-service (créditos), convite por e-mail e distribuição da extensão

**Status:** Ready
**Curadoria:** Fable 5 (2026-07-08) · **Executor:** Sonnet 5 · **Auditor:** Fable 5

## Por quê

Testers novos chegam esta semana. Faltam 3 peças: (1) cada usuário ver o PRÓPRIO
consumo em créditos, (2) convite por e-mail no backoffice ("você está convidado a
ser test user"), (3) **gap crítico achado na curadoria**: a extensão Chrome só
existe na máquina do Sandro — tester não tem como instalá-la.

## Decisões de curadoria (NÃO relitigar)

| # | Decisão | Racional |
|---|---------|----------|
| D1 | **1 crédito = 1 minuto de reunião transcrita**; limite trial = 300 créditos/mês | Métrica que o usuário entende; mapeia no custo real (STT+LLM/min) |
| D2 | Limite lido de `subscriptions.limits->>'credits_month'` com **fallback 300 no código** (sem mexer no trigger de signup) | Zero migração de dados; backoffice poderá subir limite por usuário depois |
| D3 | Consumo do usuário calculado com a RPC já existente `list_meetings_overview` (workspace-scoped, `is_member`) somada no server | Reuso; RLS já garante isolamento |
| D4 | Usuário vê créditos/minutos/reuniões/tokens; **NÃO vê custo em US$** (isso é métrica interna do backoffice) | Produto fala créditos, não custo de infra |
| D5 | Sem enforcement nesta story (medição visível apenas); bloquear início de reunião ao estourar = fase 2 | Testers não devem ser travados durante o teste |
| D6 | Convite via `admin.auth.admin.inviteUserByEmail` (e-mail nativo do Supabase; cria o user e o trigger provisiona já no convite) | Sem SMTP próprio. NOTA para relatório: o TEXTO do e-mail se personaliza no dashboard Supabase → Auth → Email Templates → Invite user (só o Sandro tem acesso; sugerir texto) |
| D7 | Extensão distribuída como **zip estático** em `apps/web/public/downloads/meet-copilot-extension.zip` + página `/app/install` com passo a passo (modo desenvolvedor → "Carregar sem compactação") | Chrome Web Store é o caminho final (exige conta developer + review) — zip destrava testers HOJE |

## Entregas

Monorepo: `/Users/sandronogueira/Downloads/Agencia_2020/80-MEET-COPILOT`
Padrões de referência: `apps/web/src/app/app/profile/*` (actions/form), `apps/web/src/app/app/page.tsx` (dashboard/Tag), `apps/web/src/app/backoffice/*` (o que acabou de ser entregue).

### A. Página "Consumo" — `apps/web/src/app/app/usage/page.tsx` (+ view client se precisar)

- Server component: user → workspace → `supabase.rpc('list_meetings_overview', { p_workspace, p_limit: 200 })`;
  filtrar `created_at` no mês corrente (America/Fortaleza); somar `duration_ms` → minutos = créditos usados.
- Tokens do mês: `select sum(tokens_in), sum(tokens_out), count(*) from suggestions` do workspace no mês
  via query com RLS. **ANTES**: verificar com MCC Supabase se `suggestions` tem policy de SELECT
  (`select policyname from pg_policies where tablename='suggestions'`). Se NÃO tiver, criar
  `supabase/migrations/0010_suggestions_select_policy.sql` com
  `create policy sg_select on suggestions for select using (app.is_member(workspace_id));` e aplicar via MCP.
- Limite: `select limits from subscriptions where workspace_id=...` → `limits->>'credits_month'` int, fallback 300.
- UI (padrão tailwind do produto, sem emoji): título "Consumo", barra de progresso créditos usados/limite
  (barra ciano; >80% âmbar; >100% vermelha), cards: reuniões no mês, minutos, sugestões geradas, tokens.
  Texto: "1 crédito = 1 minuto de reunião. Seu plano de teste inclui {limite} créditos/mês."
- Nav do app (`app/layout.tsx`): link "Consumo" entre "Reuniões" e "Bases de conhecimento".

### B. Convite por e-mail no Backoffice

- `apps/web/src/app/backoffice/actions.ts`: nova `inviteTesterAction({ fullName, email })` —
  `requireSuperadmin()`; `admin.auth.admin.inviteUserByEmail(email, { data: { full_name: fullName }, redirectTo: 'https://meet.2020agency.co/auth/callback' })`;
  audit_log `backoffice.invite_tester` (mesmo padrão das outras).
- `backoffice-view.tsx`: no form "Adicionar tester", segundo botão **"Convidar por e-mail"**
  (ao lado de "Criar com senha"); sucesso mostra "Convite enviado para {email}".

### C. Distribuição da extensão

1. Gerar o zip: da raiz do monorepo,
   `cd apps/extension && zip -r ../web/public/downloads/meet-copilot-extension.zip . -x '.*' -x '__MACOSX*' -x '*.DS_Store'`
   (criar a pasta `apps/web/public/downloads/` antes). Zip é COMMITADO (regenerar a cada mudança da extensão — adicionar nota no fim de `docs/stories/backoffice-mvp.story.md`? NÃO — criar `apps/extension/README.md` curto com a instrução de regenerar).
2. Página `apps/web/src/app/app/install/page.tsx` — "Instalar a extensão":
   passos numerados com o padrão visual do produto:
   (1) Baixar o zip (link `/downloads/meet-copilot-extension.zip`) e descompactar;
   (2) `chrome://extensions` → ativar "Modo do desenvolvedor";
   (3) "Carregar sem compactação" → escolher a pasta descompactada;
   (4) Fixar o ícone na barra; abrir a aba do Meet e clicar no ícone;
   (5) Permitir o microfone quando pedido.
   + aviso: "Durante o período de teste a extensão é instalada manualmente; a versão da
   Chrome Web Store vem em seguida."
- Nav do app: link "Instalar extensão" (depois de "Perfil").

## Regras de execução

- Zod nos inputs; `ActionResult`; comentários PT-BR do porquê; sem emoji; sem `any`.
- Typecheck: `./node_modules/.bin/tsc -p apps/web --noEmit` (raiz do monorepo).
- Commit: `git -c user.email="sandronogueira@users.noreply.github.com" -c user.name="Sandro Nogueira" commit` + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`; **NÃO fazer git push** (o auditor faz).
- Deploy Vercel: `vercel deploy --prod --yes --scope sandro-nogueiras-projects` (da raiz).
- MCP Supabase project_id: `eckpokmvahywcnmipgnv`. Engine NÃO muda.

## Verificação (obrigatória, com evidência real)

1. Typecheck PASS.
2. Se criou a migration 0010: `has_table_privilege`/pg_policies mostrando a policy nova; e uma
   query com o service role simulando `set role authenticated`? NÃO — basta pg_policies + típica RLS já coberta.
3. Pós-deploy: `/usr/bin/curl -s -o /dev/null -w '%{http_code}'` para
   `https://meet.2020agency.co/downloads/meet-copilot-extension.zip` → 200 e content-length > 10000.
4. `/app/usage` e `/app/install` no build output do Next (rotas presentes) e redirect para /login sem sessão (30x/200 da tela de login — evidenciar o código).
5. Unzip de teste do zip baixado (curl -o /tmp/ext.zip + unzip -l): deve listar manifest.json, panel.html, background.js, offscreen.js.
6. Relatório final: commits (hash), evidência por item, desvios.
