-- ============================================================================
-- Meet Copilot — pivô extensão: capture_mode, briefing pré-reunião,
-- perfis de reunião e template padrão de proposta
-- ============================================================================

alter table meetings
  add column capture_mode text not null default 'extension'
    check (capture_mode in ('extension','bot')),
  add column briefing jsonb,                    -- {impressoes, perguntas[], red_flags[]}
  add column meeting_profile_id uuid;

-- Reuniões existentes (todas via Recall até aqui)
update meetings set capture_mode = 'bot' where recall_bot_id is not null;

create table meeting_profiles (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references workspaces(id) on delete cascade,
  name               text not null,
  objective          text not null,             -- orienta o gerador de insights
  default_expert_id  uuid references sales_experts(id) on delete set null,
  default_base_id    uuid references context_bases(id) on delete set null,
  is_system          boolean not null default false,
  created_at         timestamptz not null default now()
);

alter table meeting_profiles enable row level security;
create policy mpf_all on meeting_profiles for all
  using (app.is_member(workspace_id)) with check (app.is_member(workspace_id));

alter table meetings
  add constraint meetings_profile_fk foreign key (meeting_profile_id)
  references meeting_profiles(id) on delete set null;

-- Seeds de perfis para workspaces existentes e novos (via trigger de signup)
create or replace function app.seed_meeting_profiles(ws uuid)
returns void language sql as $$
  insert into meeting_profiles (workspace_id, name, objective, is_system) values
  (ws, 'Prospecção',
   'Reunião comercial com prospect: descobrir dores, qualificar orçamento e decisor, conduzir a um próximo passo concreto. Validar afirmações do prospect sobre mercado e números.',
   true),
  (ws, 'Reunião com chefe/liderança',
   'Reunião interna com liderança: reportar status com clareza, antecipar perguntas difíceis, defender prioridades com dados. Tom executivo e direto.',
   true),
  (ws, 'Conversa informal',
   'Conversa leve (networking, amigos, comunidade): sugerir boas perguntas para aprofundar o assunto em pauta, sem tom de vendas.',
   true);
$$;

select app.seed_meeting_profiles(id) from workspaces;

-- Trigger de signup passa a semear perfis também
create or replace function app.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  ws_id uuid;
  display_name text;
begin
  display_name := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    split_part(new.email, '@', 1)
  );

  insert into workspaces (name, slug)
  values (display_name, 'ws-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
  returning id into ws_id;

  insert into workspace_members (workspace_id, user_id, role)
  values (ws_id, new.id, 'owner');

  insert into profiles (user_id, full_name, default_workspace_id)
  values (new.id, display_name, ws_id);

  insert into context_bases (workspace_id, name, is_default)
  values (ws_id, 'Base principal', true);

  perform app.seed_meeting_profiles(ws_id);

  return new;
end;
$$;
