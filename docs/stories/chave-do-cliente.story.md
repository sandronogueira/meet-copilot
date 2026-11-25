# Story: Chave de IA do cliente ("use a IA da sua empresa")

**Status:** Publicado em 2026-11-25 (banco, site e motor no commit `3ae7869`). Falta o teste com chave real de um cliente.
**Origem:** pedido do Sandro em 2026-11-24: fluxo simples para o usuário da CapBox usar a própria IA. Pergunta "como deve ser a própria IA do cliente?", resposta: "Chave do cliente".
**Executor:** Fable 5.2

## Por quê

Os primeiros usuários externos serão os vendedores da CapBox. O Sandro quer que o cliente possa
usar a própria conta de IA, para o consumo sair da conta do cliente e não da agência.

## O fluxo, do ponto de vista de quem usa

1. **Empresa (uma vez):** em "IA do copiloto", colar a chave da Anthropic e clicar em "Testar e conectar".
2. **Agência (uma vez por vendedor):** no backoffice, na coluna "IA", escolher "Equipe: <empresa>".
3. **Vendedor:** nada. A tela dele só informa que a conta usa a IA da equipe.

## Decisões

| # | Decisão | Racional |
|---|---------|----------|
| D1 | v1 aceita só chave da **Anthropic** | O copiloto ao vivo é feito sobre o Claude (roteador Haiku + gerador Sonnet). Assim a qualidade testada não muda e a chave cobre sugestões, relatório e proposta. Outros provedores ficam para depois |
| D2 | Chave guardada **cifrada** (AES-256-GCM), com a chave de cifra derivada por HKDF do `ENGINE_WS_SECRET` | Site e motor já compartilham esse segredo: não há segredo novo para alguém colar. O id do workspace entra como dado autenticado |
| D3 | Tabela `workspace_llm_keys` com RLS ligado e **nenhuma policy** | Só o service_role (site no servidor e motor) lê e grava. A tela recebe apenas os 4 últimos caracteres |
| D4 | Só guarda chave que passa num **teste real** de 1 token | O dono descobre chave errada ou conta sem crédito na hora, não no meio de uma reunião |
| D5 | **Plano B:** se a IA recusar a chave do cliente (401/403 ou sem crédito), o motor marca a chave como inválida e refaz a chamada com a chave da plataforma | A reunião do vendedor não pode ficar muda por causa de cobrança. A tela avisa o dono |
| D6 | "Equipe" = um workspace apontando para a chave de outro, criado **só pelo backoffice** | Cada usuário tem workspace próprio e não existe "empresa". Como o vínculo fica em tabela sem policy de cliente, ninguém aponta a própria conta para a chave de outro |
| D7 | Duas cópias idênticas de `llm-key-crypto.ts` (site e motor), com teste que falha se divergirem | `packages/shared` não tem tipos de Node; evita mexer em dependências e no lockfile |

## Tarefas

- [x] Cifra da chave + testes
- [x] Migração `0012_workspace_llm_keys.sql`
- [x] Tela "IA do copiloto" (`/app/ia`): colar, testar, trocar e remover
- [x] Motor: usar a chave do cliente nas sugestões ao vivo, no relatório e na proposta, com plano B
- [x] Backoffice: coluna "IA" e vínculo de equipe
- [x] Typecheck, testes, build e conferência das telas
- [x] Aplicar a migração 0012 no banco de produção
- [x] Publicar o site (Vercel) e o motor (EasyPanel)
- [ ] Primeira chave real colada por um cliente e reunião de teste

## File List

**Novos**
- `apps/web/src/lib/llm-key-crypto.ts` e `services/meeting-engine/src/lib/llm-key-crypto.ts` (idênticos)
- `apps/web/src/lib/llm-keys.ts`: teste da chave e estado para a tela
- `apps/web/src/app/app/ia/page.tsx`, `ia-form.tsx`, `actions.ts`
- `services/meeting-engine/src/lib/client-llm-key.ts`: decide se um erro condena a chave
- `services/meeting-engine/src/lib/llm-key-crypto.test.ts`, `client-llm-key.test.ts`
- `supabase/migrations/0012_workspace_llm_keys.sql`
- `docs/stories/chave-do-cliente.story.md`

**Alterados**
- `apps/web/src/app/app/layout.tsx`: item "IA do copiloto" no menu
- `apps/web/src/app/backoffice/page.tsx`, `backoffice-view.tsx`, `actions.ts`: coluna "IA" e `setTeamLlmKeyAction`
- `services/meeting-engine/src/lib/persistence.ts`: `resolveClientLlmKey`, `markClientLlmKeyInvalid`, `key_source` em `usage_events`
- `services/meeting-engine/src/pipeline/CopilotPipeline.ts`, `session/SessionManager.ts`: chave do cliente ao vivo
- `services/meeting-engine/src/pipeline/Finalizer.ts`, `index.ts`: chave do cliente em relatório e proposta

## Verificação (2026-11-24)

1. `bun run typecheck` PASS · `bun run test` **38 pass, 0 fail** (13 novos) · `NODE_ENV=production next build` PASS, 25 rotas (nova: `/app/ia`).
2. Teste de chave contra a Anthropic de verdade: chave válida da plataforma → aceita (0,6s); chave falsa → "A Anthropic não reconheceu essa chave". Nenhuma chave foi exibida.
3. Cifra com o segredo real do motor: ida e volta confere.
4. Tela conferida no app local com dados fictícios, nos 4 estados (sem chave, ativa, com problema, equipe): campo do tipo senha, botão desabilitado até colar, zero travessões.

**Não verificado:** nada disso rodou contra o banco real (a tabela ainda não existe em produção), nem o
motor usando de fato a chave de um cliente numa reunião, nem a troca para o plano B ao vivo.

## Publicação (2026-11-25)

Feita com o "Sim, publicar" do Sandro, depois de revisão do código por outra sessão (typecheck, 38 testes e build PASS).

1. **Banco:** migração 0012 aplicada pelo SQL Editor do projeto `geqbwfwevtizvmmwogob`. Conferido na hora: RLS ligado, 0 policies, 0 acessos para `anon` e `authenticated`, 7 privilégios para `service_role`, 11 colunas.
2. **Código:** commits `67a48e0` (migração 0004 idempotente) e `3ae7869` (esta story) enviados ao `main`.
3. **Site:** publicado na Vercel a partir de cópia limpa do `3ae7869` (`meet-copilot-p0jlvjn5g`). O log do build lista a rota `/app/ia`.
4. **Motor:** Deploy no EasyPanel com 0 sessões ativas. `/health` voltou com `uptimeS` de 80 segundos e `GET /experts` devolveu os 8 clones.

**Não verificado em produção:** a tela `/app/ia` com usuário logado (a conta do Sandro ainda está no cadastro inicial e é redirecionada para `/onboarding`), o motor usando a chave de um cliente numa reunião e a troca para o plano B.

## Limitações conhecidas

- Só Anthropic. OpenAI, Gemini e outros pedem adaptar o copiloto ao vivo.
- A transcrição (Groq Whisper) continua na conta da plataforma.
- O custo estimado no backoffice ainda soma os tokens das sugestões pagos pelo cliente (a tabela
  `suggestions` não registra quem pagou; `usage_events` de relatório e proposta já registra).
- Trocar o `ENGINE_WS_SECRET` invalida as chaves guardadas: os clientes precisam colar de novo.
- O motor guarda a chave aberta em memória por até 60 segundos (cache), então uma chave nova ou
  removida leva até 1 minuto para valer nas reuniões em andamento.
