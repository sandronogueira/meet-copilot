-- ============================================================================
-- Meet Copilot — configuração de LLM do copiloto por fase e por workspace
-- Cada workspace escolhe, por fase da reunião (pre_call | live | post_call),
-- o provider/modelo executor (anthropic | groq | nvidia) e, opcionalmente,
-- um advisor de auditoria (segunda camada, revisa o output do executor antes
-- de expor ao usuário). Leitura/escrita do caminho quente acontece no
-- meeting-engine via service_role (bypassa RLS); as policies abaixo protegem
-- apenas o acesso client-side (backoffice/configurações do workspace).
--
-- Regra de negócio (defense-in-depth camada 1): o advisor é PROIBIDO na fase
-- 'live' — a latência de uma segunda chamada LLM colide com o tick de tempo
-- real do copiloto. O CHECK abaixo bloqueia isso no nível do banco, mesmo que
-- a validação da aplicação falhe ou seja contornada.
-- ============================================================================

create table copilot_llm_config (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references workspaces(id) on delete cascade,
  phase               text not null check (phase in ('pre_call','live','post_call')),
  provider            text not null check (provider in ('anthropic','groq','nvidia')),
  executor_model      text not null,
  advisor_enabled     boolean not null default false,
  advisor_model       text not null default 'claude-fable-5',
  advisor_max_uses    int not null default 3,
  advisor_max_tokens  int not null default 2048,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (workspace_id, phase),
  constraint copilot_llm_config_live_no_advisor
    check (phase <> 'live' or advisor_enabled = false),
  -- a doc do advisor tool exige orçamento mínimo de 1024 tokens; e com advisor
  -- ligado, pelo menos 1 consulta deve ser permitida.
  constraint copilot_llm_config_advisor_tokens_min
    check (advisor_max_tokens >= 1024),
  constraint copilot_llm_config_advisor_uses_min
    check (advisor_max_uses >= 0 and (advisor_enabled = false or advisor_max_uses >= 1))
);

-- unique (workspace_id, phase) já cobre o lookup por workspace+fase — sem índice extra.

create trigger copilot_llm_config_touch before update on copilot_llm_config
  for each row execute function app.touch_updated_at();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------

alter table copilot_llm_config enable row level security;

-- Leitura para qualquer membro do workspace; escrita restrita a admin/owner
-- (config de backoffice — o engine lê via service_role, que bypassa RLS).
create policy llm_cfg_select on copilot_llm_config for select
  using (app.is_member(workspace_id));
create policy llm_cfg_insert on copilot_llm_config for insert
  with check (app.is_admin(workspace_id));
create policy llm_cfg_update on copilot_llm_config for update
  using (app.is_admin(workspace_id)) with check (app.is_admin(workspace_id));
create policy llm_cfg_delete on copilot_llm_config for delete
  using (app.is_admin(workspace_id));
