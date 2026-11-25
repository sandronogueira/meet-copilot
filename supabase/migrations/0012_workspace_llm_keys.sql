-- ============================================================================
-- 0012: chave de IA do cliente por workspace ("use a IA da sua empresa")
--
-- Cada workspace pode ter UMA destas duas coisas:
--   a) chave propria: o dono colou a chave da conta de IA da empresa. Fica
--      cifrada (AES-256-GCM, ver lib/llm-key-crypto.ts); o banco nunca ve a
--      chave em texto puro.
--   b) chave da equipe: o workspace usa a chave guardada em OUTRO workspace
--      (source_workspace_id). So o backoffice cria esse vinculo. E assim que os
--      vendedores de um cliente usam a chave da empresa sem nunca toca-la.
--
-- Sem linha = o workspace usa a chave da plataforma (comportamento de sempre).
--
-- SEGURANCA: RLS ligado e NENHUMA policy, de proposito. Nem anon nem usuario
-- logado leem ou gravam aqui; so o service_role (site no servidor e motor).
-- ============================================================================

create table workspace_llm_keys (
  workspace_id         uuid primary key references workspaces(id) on delete cascade,
  provider             text not null default 'anthropic' check (provider in ('anthropic')),
  key_ciphertext       text,
  key_hint             text,             -- 4 ultimos caracteres, so para o dono reconhecer
  source_workspace_id  uuid references workspaces(id) on delete cascade,
  status               text not null default 'active' check (status in ('active', 'invalid')),
  last_error           text,
  last_ok_at           timestamptz,
  created_by           uuid references auth.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- exatamente uma das duas formas: chave propria OU vinculo com a equipe
  constraint workspace_llm_keys_own_or_team check (
    (key_ciphertext is not null and key_hint is not null and source_workspace_id is null)
    or (key_ciphertext is null and key_hint is null and source_workspace_id is not null)
  ),
  constraint workspace_llm_keys_no_self_link check (
    source_workspace_id is null or source_workspace_id <> workspace_id
  )
);

create index workspace_llm_keys_source_idx on workspace_llm_keys (source_workspace_id)
  where source_workspace_id is not null;

create trigger workspace_llm_keys_touch before update on workspace_llm_keys
  for each row execute function app.touch_updated_at();

alter table workspace_llm_keys enable row level security;

-- Defesa em profundidade: o projeto concede acesso de API a tabelas novas
-- automaticamente; aqui isso e retirado de quem nao e service_role.
revoke all on table workspace_llm_keys from anon, authenticated;
