-- ============================================================================
-- Meet Copilot — schema core v1
-- Multi-tenant por workspace_id + RLS em todas as tabelas de domínio.
-- Escritas do caminho quente (meeting-engine) usam service_role e são
-- escopadas por função na aplicação; clientes só enxergam via RLS.
-- ============================================================================

create extension if not exists vector;

create schema if not exists app;

-- ----------------------------------------------------------------------------
-- TENANCY / AUTH
-- ----------------------------------------------------------------------------

create table workspaces (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  slug            text not null unique,
  plan            text not null default 'trial',
  settings        jsonb not null default '{}',      -- {bot_name, locale, ...} (white-label)
  retention_days  int  not null default 90,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create table workspace_members (
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  role          text not null check (role in ('owner','admin','member')),
  created_at    timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table profiles (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  full_name             text,
  avatar_url            text,
  default_workspace_id  uuid references workspaces(id) on delete set null,
  locale                text not null default 'pt-BR',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Helper de membership (security definer evita recursão de RLS)
create or replace function app.is_member(ws uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid()
  );
$$;

create or replace function app.is_admin(ws uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid()
      and m.role in ('owner','admin')
  );
$$;

-- ----------------------------------------------------------------------------
-- BASE DE CONTEXTO (RAG)
-- ----------------------------------------------------------------------------

create table context_bases (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  name          text not null,
  description   text,
  is_default    boolean not null default false,
  created_at    timestamptz not null default now()
);

create table documents (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references workspaces(id) on delete cascade,
  context_base_id  uuid not null references context_bases(id) on delete cascade,
  source_type      text not null check (source_type in ('file','url','text','pricing_table','case','onboarding_profile')),
  title            text not null,
  storage_path     text,             -- Supabase Storage (bucket privado)
  source_url       text,
  status           text not null default 'pending'
                   check (status in ('pending','processing','ready','error')),
  error_detail     text,
  content_hash     text,
  meta             jsonb not null default '{}',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table document_chunks (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references documents(id) on delete cascade,
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  chunk_index   int  not null,
  content       text not null,
  token_count   int,
  embedding     vector(1536),
  tsv           tsvector generated always as (to_tsvector('portuguese', content)) stored,
  created_at    timestamptz not null default now()
);

create index document_chunks_embedding_idx on document_chunks
  using hnsw (embedding vector_cosine_ops);
create index document_chunks_tsv_idx on document_chunks using gin (tsv);
create index document_chunks_workspace_idx on document_chunks (workspace_id);

-- ----------------------------------------------------------------------------
-- REUNIÕES / TRANSCRIÇÃO
-- ----------------------------------------------------------------------------

create table meetings (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references workspaces(id) on delete cascade,
  created_by       uuid not null references auth.users(id),
  title            text,
  platform         text check (platform in ('meet','zoom','teams')),
  meeting_url      text,
  recall_bot_id    text unique,
  status           text not null default 'created'
                   check (status in ('created','joining','in_call','processing','done','failed','deleted')),
  language         text not null default 'pt-BR',
  consent          jsonb not null default '{}',     -- {bot_name, announced_at, confirmed_by}
  started_at       timestamptz,
  ended_at         timestamptz,
  retention_until  timestamptz,
  media_deleted_at timestamptz,
  settings         jsonb not null default '{}',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index meetings_workspace_idx on meetings (workspace_id, created_at desc);

create table meeting_participants (
  id            uuid primary key default gen_random_uuid(),
  meeting_id    uuid not null references meetings(id) on delete cascade,
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  display_name  text not null,
  is_host       boolean not null default false,
  is_self       boolean not null default false,      -- o usuário do copiloto
  created_at    timestamptz not null default now()
);

create table transcript_segments (
  id              uuid primary key default gen_random_uuid(),
  meeting_id      uuid not null references meetings(id) on delete cascade,
  workspace_id    uuid not null references workspaces(id) on delete cascade,
  participant_id  uuid references meeting_participants(id) on delete set null,
  speaker_label   text,
  started_ms      int not null,
  ended_ms        int not null,
  text            text not null,
  confidence      real,
  source          text not null default 'recall_deepgram',
  seq             bigint not null,
  created_at      timestamptz not null default now()
);

create index transcript_segments_meeting_seq_idx on transcript_segments (meeting_id, seq);

-- ----------------------------------------------------------------------------
-- IA EM TEMPO REAL
-- ----------------------------------------------------------------------------

create table suggestions (
  id                 uuid primary key default gen_random_uuid(),
  meeting_id         uuid not null references meetings(id) on delete cascade,
  workspace_id       uuid not null references workspaces(id) on delete cascade,
  kind               text not null check (kind in ('question','insight','objection','next_step','risk')),
  content            text not null,
  rationale          text,
  context_refs       jsonb not null default '[]',   -- chunk_ids usados (auditabilidade do RAG)
  anchor_segment_id  uuid references transcript_segments(id) on delete set null,
  status             text not null default 'shown' check (status in ('shown','used','dismissed')),
  model              text,
  tokens_in          int,
  tokens_out         int,
  created_at         timestamptz not null default now()
);

create index suggestions_meeting_idx on suggestions (meeting_id, created_at);

create table fact_checks (
  id                uuid primary key default gen_random_uuid(),
  meeting_id        uuid not null references meetings(id) on delete cascade,
  workspace_id      uuid not null references workspaces(id) on delete cascade,
  claim_text        text not null,
  claim_segment_id  uuid references transcript_segments(id) on delete set null,
  speaker_label     text,
  verdict           text not null check (verdict in ('supported','partially_supported','unverified','disputed')),
  confidence        text not null check (confidence in ('low','medium','high')),
  summary           text,
  sources           jsonb not null default '[]',   -- [{url,title,quote,accessed_at}]
  model             text,
  search_count      int not null default 0,
  created_at        timestamptz not null default now()
);

create index fact_checks_meeting_idx on fact_checks (meeting_id, created_at);

-- ----------------------------------------------------------------------------
-- PROPOSTAS
-- ----------------------------------------------------------------------------

create table proposal_templates (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references workspaces(id) on delete cascade,
  name              text not null,
  engine_version    int not null default 1,
  sections          jsonb not null,                -- schema de seções (Zod-validado na app)
  theme             jsonb not null default '{}',   -- design tokens (dark premium)
  default_packages  jsonb not null default '[]',   -- tabela OFICIAL de preços — única fonte de valores
  is_default        boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table proposals (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references workspaces(id) on delete cascade,
  meeting_id        uuid references meetings(id) on delete set null,
  template_id       uuid references proposal_templates(id) on delete set null,
  slug              text not null unique,          -- slugify(cliente)-nanoid — não adivinhável
  title             text not null,
  client_name       text,
  status            text not null default 'draft'
                    check (status in ('draft','published','accepted','expired','archived')),
  content           jsonb not null default '{}',   -- ProposalContent (Zod)
  published_at      timestamptz,
  expires_at        timestamptz,
  password_hash     text,
  pdf_storage_path  text,
  view_count        int not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table proposal_views (
  id            uuid primary key default gen_random_uuid(),
  proposal_id   uuid not null references proposals(id) on delete cascade,
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  viewed_at     timestamptz not null default now(),
  ip_hash       text,                              -- hash, nunca IP puro (LGPD)
  user_agent    text,
  referer       text
);

-- Página pública lê APENAS via esta função (anon key nunca toca as tabelas)
create or replace function app.get_published_proposal(p_slug text)
returns table (title text, client_name text, content jsonb, theme jsonb, expires_at timestamptz)
language sql stable security definer
set search_path = public
as $$
  select p.title, p.client_name, p.content,
         coalesce(t.theme, '{}'::jsonb) as theme, p.expires_at
  from proposals p
  left join proposal_templates t on t.id = p.template_id
  where p.slug = p_slug
    and p.status = 'published'
    and (p.expires_at is null or p.expires_at > now());
$$;

-- ----------------------------------------------------------------------------
-- PÓS-REUNIÃO
-- ----------------------------------------------------------------------------

create table reports (
  id            uuid primary key default gen_random_uuid(),
  meeting_id    uuid not null unique references meetings(id) on delete cascade,
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  summary       text,
  decisions     jsonb not null default '[]',
  action_items  jsonb not null default '[]',
  red_flags     jsonb not null default '[]',
  objections    jsonb not null default '[]',
  next_steps    jsonb not null default '[]',
  delivery      jsonb not null default '[]',       -- [{channel,to,status,at}]
  created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- BILLING / USO / GOVERNANÇA
-- ----------------------------------------------------------------------------

create table usage_events (
  id                   uuid primary key default gen_random_uuid(),
  workspace_id         uuid not null references workspaces(id) on delete cascade,
  meeting_id           uuid references meetings(id) on delete set null,
  kind                 text not null check (kind in
                       ('bot_hour','stt_hour','llm_tokens','web_search',
                        'proposal_generated','embedding_tokens')),
  quantity             numeric not null,
  unit                 text not null,
  cost_estimate_cents  int,
  meta                 jsonb not null default '{}',
  created_at           timestamptz not null default now()
);

create index usage_events_workspace_idx on usage_events (workspace_id, created_at desc);

create table subscriptions (
  workspace_id        uuid primary key references workspaces(id) on delete cascade,
  provider            text not null default 'stripe',
  external_id         text,
  plan                text not null default 'trial',
  status              text not null default 'active',
  current_period_end  timestamptz,
  limits              jsonb not null default '{}',  -- {meeting_hours, seats, ...}
  updated_at          timestamptz not null default now()
);

create table api_keys (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  name          text not null,
  key_hash      text not null,                     -- sha256; plaintext nunca persiste
  prefix        text not null,                     -- 'mc_live_xxxx' para exibição
  scopes        text[] not null default '{}',
  last_used_at  timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz not null default now()
);

create table audit_logs (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references workspaces(id) on delete cascade,
  actor_user_id  uuid references auth.users(id) on delete set null,
  actor_type     text not null default 'user',     -- user | system | engine
  action         text not null,
  target_type    text,
  target_id      uuid,
  ip             inet,
  meta           jsonb not null default '{}',
  created_at     timestamptz not null default now()
);

create index audit_logs_workspace_idx on audit_logs (workspace_id, created_at desc);

-- Fila simples em Postgres (padrão pg_advisory_lock no worker)
create table jobs (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  kind          text not null,
  payload       jsonb not null default '{}',
  status        text not null default 'pending'
                check (status in ('pending','running','done','failed','dead')),
  run_after     timestamptz not null default now(),
  attempts      int not null default 0,
  locked_by     text,
  locked_at     timestamptz,
  created_at    timestamptz not null default now()
);

create index jobs_poll_idx on jobs (status, run_after);

-- ----------------------------------------------------------------------------
-- BUSCA HÍBRIDA (cosine HNSW + full-text 'portuguese', fusão por RRF)
-- ----------------------------------------------------------------------------

create or replace function match_chunks(
  p_workspace_id     uuid,
  p_query_embedding  vector(1536),
  p_query_text       text,
  p_k                int default 6
)
returns table (
  chunk_id     uuid,
  document_id  uuid,
  content      text,
  score        float
)
language sql stable
as $$
  with semantic as (
    select c.id, row_number() over (order by c.embedding <=> p_query_embedding) as rank
    from document_chunks c
    where c.workspace_id = p_workspace_id and c.embedding is not null
    order by c.embedding <=> p_query_embedding
    limit 30
  ),
  lexical as (
    select c.id, row_number() over (
             order by ts_rank(c.tsv, websearch_to_tsquery('portuguese', p_query_text)) desc
           ) as rank
    from document_chunks c
    where c.workspace_id = p_workspace_id
      and c.tsv @@ websearch_to_tsquery('portuguese', p_query_text)
    limit 30
  ),
  fused as (
    select coalesce(s.id, l.id) as id,
           coalesce(1.0 / (60 + s.rank), 0) + coalesce(1.0 / (60 + l.rank), 0) as rrf
    from semantic s
    full outer join lexical l on l.id = s.id
  )
  select c.id, c.document_id, c.content, f.rrf
  from fused f
  join document_chunks c on c.id = f.id
  order by f.rrf desc
  limit p_k;
$$;

-- ----------------------------------------------------------------------------
-- updated_at automático
-- ----------------------------------------------------------------------------

create or replace function app.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['workspaces','profiles','documents','meetings',
                           'proposal_templates','proposals','subscriptions']
  loop
    execute format(
      'create trigger %I_touch before update on %I
       for each row execute function app.touch_updated_at()', t, t);
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------

alter table workspaces           enable row level security;
alter table workspace_members    enable row level security;
alter table profiles             enable row level security;
alter table context_bases        enable row level security;
alter table documents            enable row level security;
alter table document_chunks      enable row level security;
alter table meetings             enable row level security;
alter table meeting_participants enable row level security;
alter table transcript_segments  enable row level security;
alter table suggestions          enable row level security;
alter table fact_checks          enable row level security;
alter table proposal_templates   enable row level security;
alter table proposals            enable row level security;
alter table proposal_views       enable row level security;
alter table reports              enable row level security;
alter table usage_events         enable row level security;
alter table subscriptions        enable row level security;
alter table api_keys             enable row level security;
alter table audit_logs           enable row level security;
alter table jobs                 enable row level security;

-- workspaces: membro lê; owner/admin atualiza; criação via RPC/service role
create policy ws_select on workspaces for select using (app.is_member(id));
create policy ws_update on workspaces for update
  using (app.is_admin(id)) with check (app.is_admin(id));

-- workspace_members: enxerga a própria linha e as do workspace onde é membro
create policy wm_select on workspace_members for select
  using (user_id = auth.uid() or app.is_member(workspace_id));
create policy wm_admin_insert on workspace_members for insert
  with check (app.is_admin(workspace_id));
create policy wm_admin_delete on workspace_members for delete
  using (app.is_admin(workspace_id));

-- profiles: dono da linha
create policy pr_select on profiles for select using (user_id = auth.uid());
create policy pr_upsert on profiles for insert with check (user_id = auth.uid());
create policy pr_update on profiles for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Padrão membro: select para membros; insert/update para membros; delete admin
create policy cb_all on context_bases for all
  using (app.is_member(workspace_id)) with check (app.is_member(workspace_id));
create policy doc_all on documents for all
  using (app.is_member(workspace_id)) with check (app.is_member(workspace_id));
create policy chunk_select on document_chunks for select using (app.is_member(workspace_id));

create policy mt_select on meetings for select using (app.is_member(workspace_id));
create policy mt_insert on meetings for insert with check (app.is_member(workspace_id));
create policy mt_update on meetings for update
  using (app.is_member(workspace_id)) with check (app.is_member(workspace_id));

create policy mp_select on meeting_participants for select using (app.is_member(workspace_id));
create policy ts_select on transcript_segments  for select using (app.is_member(workspace_id));
create policy sg_select on suggestions          for select using (app.is_member(workspace_id));
create policy sg_update on suggestions for update            -- feedback used/dismissed
  using (app.is_member(workspace_id)) with check (app.is_member(workspace_id));
create policy fc_select on fact_checks for select using (app.is_member(workspace_id));

create policy pt_all on proposal_templates for all
  using (app.is_member(workspace_id)) with check (app.is_member(workspace_id));
create policy pp_all on proposals for all
  using (app.is_member(workspace_id)) with check (app.is_member(workspace_id));
create policy pv_select on proposal_views for select using (app.is_member(workspace_id));

create policy rp_select on reports       for select using (app.is_member(workspace_id));
create policy ue_select on usage_events  for select using (app.is_member(workspace_id));
create policy sub_select on subscriptions for select using (app.is_member(workspace_id));

create policy ak_select on api_keys for select using (app.is_admin(workspace_id));
create policy ak_insert on api_keys for insert with check (app.is_admin(workspace_id));
create policy ak_update on api_keys for update
  using (app.is_admin(workspace_id)) with check (app.is_admin(workspace_id));

-- audit_logs: leitura para admins; escrita apenas service role (sem policy de insert)
create policy al_select on audit_logs for select using (app.is_admin(workspace_id));

-- jobs: apenas service role (nenhuma policy = invisível para clientes)

-- Escritas do caminho quente (transcript_segments, suggestions, fact_checks,
-- document_chunks, proposal_views, reports, usage_events, jobs) acontecem
-- exclusivamente via service_role no meeting-engine/jobs — sem policies de
-- insert para clientes, de propósito.
