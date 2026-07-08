# Story: Backoffice MVP — Gestão de Usuários, Acessos e Consumo

**Status:** Ready
**Curadoria:** Atlas/Fable 5 (2026-07-08) · **Executor:** Sonnet 5 · **Auditor:** Fable 5

## Por quê

Sandro vai adicionar testers à plataforma e precisa de: (1) Usuários, (2) Acessos,
(3) Consumo de dados, (4) Administração, (5) Backoffice superadmin. A fundação já
existe (Supabase Auth, workspaces multi-tenant com RLS, trigger `app.handle_new_user`
que provisiona workspace+perfil+base no signup, `audit_logs`, `subscriptions`,
tokens gravados em `suggestions`). O que falta é a visão CROSS-TENANT restrita.

## Decisões de curadoria (NÃO relitigar)

| # | Decisão | Racional |
|---|---------|----------|
| D1 | Testers criados DIRETO no backoffice (e-mail + senha gerada, e-mail pré-confirmado) | Pedido literal do Sandro; zero fricção; sem dependência de SMTP. `auth.admin.createUser` dispara o mesmo trigger de provisioning do signup |
| D2 | Superadmin por allowlist de e-mails na env `SUPERADMIN_EMAILS` (CSV) | Não-manipulável via banco; simples de mudar na Vercel; guard server-side; não-admin recebe 404 (rota não revela existência) |
| D3 | Consumo derivado das tabelas quentes (meetings, transcript_segments, suggestions) via RPC `security definer` com EXECUTE revogado de anon/authenticated (só service_role) | usage_events está subutilizada; 1 chamada para tudo; escala |
| D4 | Bloqueio de acesso = ban nativo do Supabase Auth (`ban_duration`) + toda ação logada em `audit_logs` (action `backoffice.*`) | Sem coluna nova; banido não loga; auditoria pronta |
| D5 | FORA do MVP: quotas/planos (subscriptions.limits fica para depois), RBAC fino, billing, convite por e-mail | Foco na entrega que destrava os testers |

## Arquivos a criar/alterar

Monorepo: `/Users/sandronogueira/Downloads/Agencia_2020/80-MEET-COPILOT`

### 1. `supabase/migrations/0009_backoffice.sql` (aplicar via MCP Supabase `apply_migration`, project_id `eckpokmvahywcnmipgnv`, E salvar o arquivo)

```sql
-- Visão cross-tenant do backoffice. SOMENTE service_role executa.
create or replace function public.backoffice_overview()
returns table (
  workspace_id uuid, workspace_name text, plan text,
  owner_user_id uuid, owner_email text, owner_name text,
  banned_until timestamptz, last_sign_in_at timestamptz, user_created_at timestamptz,
  members int, meetings int, talk_minutes numeric,
  tokens_in bigint, tokens_out bigint, suggestions int, proposals int, reports int,
  last_activity timestamptz
)
language sql stable security definer
set search_path = public, auth
as $$
  select
    w.id, w.name, w.plan,
    u.id, u.email::text, p.full_name,
    u.banned_until, u.last_sign_in_at, u.created_at,
    (select count(*)::int from workspace_members wm2 where wm2.workspace_id = w.id),
    (select count(*)::int from meetings mt where mt.workspace_id = w.id),
    coalesce((
      select round(sum(extract(epoch from spans.dur))/60.0, 1) from (
        select max(ts.created_at) - min(ts.created_at) as dur
        from transcript_segments ts join meetings mt2 on mt2.id = ts.meeting_id
        where mt2.workspace_id = w.id group by ts.meeting_id
      ) spans
    ), 0),
    coalesce((select sum(s.tokens_in)::bigint from suggestions s where s.workspace_id = w.id), 0),
    coalesce((select sum(s.tokens_out)::bigint from suggestions s where s.workspace_id = w.id), 0),
    (select count(*)::int from suggestions s where s.workspace_id = w.id),
    (select count(*)::int from proposals pr where pr.workspace_id = w.id),
    (select count(*)::int from reports r where r.workspace_id = w.id),
    (select max(ts.created_at) from transcript_segments ts
      join meetings mt3 on mt3.id = ts.meeting_id where mt3.workspace_id = w.id)
  from workspaces w
  join workspace_members wm on wm.workspace_id = w.id and wm.role = 'owner'
  join auth.users u on u.id = wm.user_id
  left join profiles p on p.user_id = u.id
  order by u.created_at desc;
$$;
revoke execute on function public.backoffice_overview() from public, anon, authenticated;

create or replace function public.backoffice_platform_stats()
returns table (users int, workspaces int, meetings int, meetings_7d int,
  suggestions int, tokens_in bigint, tokens_out bigint, proposals int)
language sql stable security definer set search_path = public, auth
as $$
  select
    (select count(*)::int from auth.users),
    (select count(*)::int from workspaces),
    (select count(*)::int from meetings),
    (select count(*)::int from meetings where created_at > now() - interval '7 days'),
    (select count(*)::int from suggestions),
    coalesce((select sum(tokens_in)::bigint from suggestions), 0),
    coalesce((select sum(tokens_out)::bigint from suggestions), 0),
    (select count(*)::int from proposals);
$$;
revoke execute on function public.backoffice_platform_stats() from public, anon, authenticated;
```

### 2. `apps/web/src/lib/superadmin.ts`

`requireSuperadmin()`: pega user via `supabaseServer()`; compara `user.email` (lowercase)
com `process.env.SUPERADMIN_EMAILS` (CSV, lowercase/trim). Não passar → `notFound()`
(import de `next/navigation`). Retorna `{ email, userId }`.

### 3. `apps/web/src/app/backoffice/layout.tsx`

Server layout: `await requireSuperadmin()`; shell mínimo com a marca (`.brand-mark`,
como `app/layout.tsx`) + badge "BACKOFFICE" + link "← voltar ao app" + `{children}`.

### 4. `apps/web/src/app/backoffice/actions.ts` (`'use server'`)

Todas começam com `requireSuperadmin()` e usam `supabaseAdmin()` de
`@/lib/supabase/admin` (já existe). Gravar auditoria em `audit_logs` via admin client:
`{ workspace_id, actor_user_id: <superadmin userId... usar target workspace>, actor_type: 'user', action, target_type, target_id, meta }`.

- `createTesterAction({ fullName, email })`: senha = 16 chars fortes
  (`crypto.randomBytes` base64url slice). `admin.auth.admin.createUser({ email,
  password, email_confirm: true, user_metadata: { full_name: fullName } })` — o
  trigger provisiona workspace/perfil/base sozinho. Buscar
  `profiles.default_workspace_id` do novo user para o audit_log
  (action `backoffice.create_tester`). Retorna `{ password }` — exibida UMA vez na UI.
- `setUserBanAction({ userId, ban: boolean })`:
  `admin.auth.admin.updateUserById(userId, { ban_duration: ban ? '87600h' : 'none' })`
  + audit `backoffice.ban` / `backoffice.unban`.
- `resetTesterPasswordAction({ userId })`: nova senha 16 chars via
  `updateUserById(userId, { password })` + audit `backoffice.reset_password`.
  Retorna `{ password }` (exibir uma vez).

### 5. `apps/web/src/app/backoffice/page.tsx` + `backoffice-view.tsx`

Page (server): `requireSuperadmin()`; `supabaseAdmin().rpc('backoffice_platform_stats')`
e `.rpc('backoffice_overview')`; passa para a view.
View (client, tailwind no padrão de `app/profile/profile-form.tsx` — dark #111214,
`text-primary-fixed`, `font-label-caps`):

- **Administração (topo):** cards com usuários, reuniões (total e 7d), sugestões,
  tokens totais e custo estimado da plataforma. Custo estimado (US$):
  `(tokens_in*3 + tokens_out*15)/1e6` com rótulo "estimado".
- **Adicionar tester:** form nome+e-mail → `createTesterAction` → painel de sucesso
  com e-mail + senha gerada + botão copiar ("anote — não será exibida de novo").
- **Usuários:** tabela com nome/e-mail, workspace, status (Ativo / Bloqueado via
  `banned_until > now()`), reuniões, minutos, tokens (in+out) e custo estimado,
  último login, última atividade; ações por linha: Bloquear/Reativar (confirmação
  em 2 cliques, padrão do produto) e Reset de senha (mostra a nova uma vez).
  Sem emojis; ícones Material Symbols monocromáticos.

### 6. Env `SUPERADMIN_EMAILS`

- Adicionar na Vercel (Production): `printf 'sandronogueira1980@gmail.com' | vercel env add SUPERADMIN_EMAILS production --scope sandro-nogueiras-projects` (cwd raiz do monorepo).
- Adicionar linha comentada no `apps/web/.env.example`.

### 7. Link discreto no app

Em `apps/web/src/app/app/layout.tsx`, nav: item "Backoffice" SÓ se o e-mail do user
estiver na allowlist (reusar `isSuperadmin(email)` — exportar helper puro além do
`requireSuperadmin`).

## Regras de execução

- Padrões do repo: comentários PT-BR explicando o porquê; zod nos inputs das actions;
  `ActionResult { error?: string }`; sem `any`; sem emojis na UI.
- Typecheck: `./node_modules/.bin/tsc -p apps/web --noEmit` (da raiz do monorepo).
- Commits: `git -c user.email="sandronogueira@users.noreply.github.com" -c user.name="Sandro Nogueira" commit` + rodapé `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`; conventional commits; push `origin main`.
- Deploy: `vercel deploy --prod --yes --scope sandro-nogueiras-projects` (da raiz).
- Engine NÃO muda nesta story.

## Verificação (obrigatória)

1. Typecheck PASS.
2. Via MCP Supabase (service_role): `select * from public.backoffice_overview()` retorna
   ≥1 linha (workspace do Sandro) com meetings/tokens > 0; `backoffice_platform_stats()` ok.
3. Segurança: `select has_function_privilege('authenticated', 'public.backoffice_overview()', 'execute')` → **false** (e igual para anon).
4. Pós-deploy: `curl -s -o /dev/null -w "%{http_code}" https://meet.2020agency.co/backoffice`
   sem sessão → 404 (guard não vaza a rota).
5. Criar tester REAL de teste via SQL não — criar via `admin.auth.admin.createUser` em
   script Node local one-off (env service em `/tmp/vercel-env-prod.txt`? NÃO — usar
   `/tmp/engine-env.txt` que tem SUPABASE_URL + SERVICE_ROLE_KEY): e-mail
   `tester-qa+backoffice@2020agency.co`, confirmar que profiles/workspace foram
   provisionados (query), depois DELETAR o user de teste
   (`admin.auth.admin.deleteUser`) e confirmar cascade limpo.
6. Relatório final com evidências (saídas reais das queries e do curl).
```