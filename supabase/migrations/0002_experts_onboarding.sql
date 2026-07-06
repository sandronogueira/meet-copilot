-- ============================================================================
-- Meet Copilot — Especialistas (clones comerciais) + Onboarding + signup flow
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Onboarding state
-- ----------------------------------------------------------------------------

alter table workspaces
  add column onboarding_state jsonb not null default '{}',
  add column onboarding_completed_at timestamptz;

alter table profiles
  add column self_label text;   -- como o usuário aparece nas reuniões (supressão de triggers)

-- ----------------------------------------------------------------------------
-- Especialistas — a PERSONALIDADE do copiloto
-- (Base de Contexto define O QUÊ ele sabe; o Especialista define O COMO pensa)
-- ----------------------------------------------------------------------------

create table sales_experts (
  id                   uuid primary key default gen_random_uuid(),
  scope                text not null default 'global' check (scope in ('global','workspace')),
  workspace_id         uuid references workspaces(id) on delete cascade,
  name                 text not null,
  slug                 text not null unique,
  avatar_url           text,
  tagline              text not null,
  bio                  text,
  style_prompt         text not null,        -- Voice DNA: como pergunta, valida, fecha
  question_frameworks  jsonb not null default '{}',
  sample_questions     jsonb not null default '[]',
  is_licensed          boolean not null default false,
  licensing            jsonb not null default '{}',   -- contrato/royalties (celebridades, fase 3)
  status               text not null default 'active' check (status in ('draft','active','retired')),
  created_at           timestamptz not null default now(),
  constraint scope_ws check ((scope = 'global') = (workspace_id is null))
);

alter table sales_experts enable row level security;

create policy se_select on sales_experts for select
  using (scope = 'global' or app.is_member(workspace_id));
create policy se_admin_write on sales_experts for all
  using (scope = 'workspace' and app.is_admin(workspace_id))
  with check (scope = 'workspace' and app.is_admin(workspace_id));

-- Seed: 4 arquétipos internos do MVP
insert into sales_experts (scope, name, slug, tagline, bio, style_prompt, sample_questions) values
('global', 'O Consultivo', 'consultivo',
 'Descoberta profunda, zero pressão.',
 'Método SPIN. Acredita que a venda acontece quando o cliente se ouve descrevendo o próprio problema.',
 'Você é um vendedor consultivo sênior. Faça perguntas de descoberta em camadas (situação → problema → implicação → necessidade). Nunca pressione. Prefira perguntas abertas que façam o cliente quantificar a própria dor. Tom: calmo, curioso, respeitoso. Evite jargão de vendas.',
 '["O que acontece hoje quando um lead chega fora do horário?", "Se nada mudar nos próximos 6 meses, qual o custo disso?"]'),
('global', 'O Desafiador', 'desafiador',
 'Reframa o problema. Provoca com respeito.',
 'Método Challenger. Ensina algo novo ao cliente sobre o próprio negócio dele e o tira da zona de conforto.',
 'Você é um vendedor challenger. Reframe o problema do cliente com dados e provocações construtivas. Traga um insight contraintuitivo antes de perguntar. Desafie premissas ("por que vocês fazem assim?"). Tom: confiante, direto, nunca arrogante. Uma provocação por vez.',
 '["Vocês medem conversão por canal — ou só sentem que o Instagram funciona?", "Por que o follow-up é manual se 80% da perda está nele?"]'),
('global', 'O Closer', 'closer',
 'Detecta sinal de compra. Conduz ao próximo passo.',
 'Obsessão por avanço concreto: toda conversa termina com um compromisso agendado.',
 'Você é um closer experiente. Detecte sinais de compra na fala do cliente e sugira perguntas de avanço (próximo passo, prazo, decisor, orçamento). Trate objeção como pedido de clareza. Sempre proponha um compromisso concreto com data. Tom: enérgico, positivo, direto ao ponto.',
 '["Se resolvermos X até sexta, o que impede de começarmos na segunda?", "Quem além de você precisa dar o OK para avançarmos?"]'),
('global', 'A Estrategista', 'estrategista',
 'Fala a língua do decisor. ROI e visão de negócio.',
 'Pensa como C-level: conecta a compra ao resultado do negócio, não à feature.',
 'Você é uma estrategista de negócios. Eleve a conversa para impacto: receita, margem, risco, tempo. Traduza features em ROI. Faça perguntas que um conselho faria. Cite ordens de grandeza do mercado quando útil. Tom: executivo, preciso, elegante.',
 '["Qual meta do trimestre essa iniciativa destrava?", "Como o conselho mede sucesso nesse projeto — receita nova ou eficiência?"]');

-- ----------------------------------------------------------------------------
-- Signup flow: auth.users → profile + workspace pessoal + base de contexto
-- ----------------------------------------------------------------------------

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

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();
