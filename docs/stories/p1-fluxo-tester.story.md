# Story: Correções P1 do fluxo do tester — retomar cadastro, ler o site, relatório pós-reunião

**Status:** InReview (implementado e verificado localmente; **não commitado, não publicado**)
**Origem:** `docs/qa/po-flow-validation.md` §3, itens P1-1, P1-2 e P1-3 (Pax/PO, julho de 2026)
**Executor:** Fable 5.2 (2026-11-24)

## Por quê

Em 2026-11-24 a produção foi religada a um banco novo e o Sandro está refazendo o
próprio cadastro em `meet.2020agency.co/onboarding`. As três falhas P1 do relatório de
QA batem exatamente nesse caminho: (1) um F5 no cadastro apaga o que foi digitado,
(2) o cadastro promete ler o site da empresa e nunca lê, (3) terminada a reunião, não
há botão para gerar relatório/proposta. As três foram reconfirmadas no código atual
antes de qualquer alteração.

## Decisões

| # | Decisão | Racional |
|---|---------|----------|
| D1 | **P1-1:** a etapa atual é gravada em `workspaces.onboarding_state.step` a cada navegação, e a página abre nela (`resolveInitialStep`). Sem Perfil salvo, sempre começa do Perfil | O critério de aceite pedia "abrir na etapa seguinte **ou** pré-preencher"; fazer os dois é barato e é o que "retomar de onde parou" significa. Sem migração: a coluna jsonb já existe |
| D2 | **P1-1:** os campos do Perfil são relidos de onde `saveProfileStep` já os grava (`settings.sales_profile`, documento `onboarding_profile`, documento de URL) — nada é duplicado em `onboarding_state` | Fonte única de verdade; um dado não pode ficar diferente do outro |
| D3 | **P1-1:** o rascunho do Perfil subiu para o componente pai (`OnboardingFlow`) | Antes, voltar ao Perfil na mesma sessão também zerava os campos (o passo era desmontado) |
| D4 | **P1-2: caminho (a) — implementar a leitura**, no `apps/web`, na hora em que o usuário adiciona a URL | Mesmo padrão do upload de arquivo (`uploadFileDocumentAction`: extrai na hora e grava `meta.raw_text`). O engine **não muda** (`loadContext` já lê `meta.raw_text`), não há migração nem dependência nova, e a promessa central do produto ("entre sem saber nada…") passa a ser verdade. O caminho (b) só esconderia o problema: o copiloto continuaria sem saber nada do site |
| D5 | **P1-2:** lê a página informada + até 4 páginas internas que explicam o negócio (sobre, serviços, planos, cases…), em paralelo, com limite de tempo (6s + 4s) | "Ler o site" com uma página só seria meia promessa; o limite mantém o "Continuar" do cadastro responsivo |
| D6 | **P1-2:** texto do site limitado a ~7.000 caracteres (3.000 da página inicial + 1.000 por página interna); menus (`<nav>`) e linhas repetidas saem | O engine injeta no máximo 9.000 caracteres de contexto por reunião somando toda a base — o site não pode ocupar tudo |
| D7 | **P1-2:** proteção SSRF — só http/https nas portas padrão; endereços internos (loopback, rede privada, link-local/metadata) recusados antes de qualquer requisição; cada redirecionamento é revalidado | A URL vem do usuário e quem busca é o nosso servidor |
| D8 | **P1-2:** no cadastro a leitura é *fail-soft* (site fora do ar não trava o onboarding: documento fica `error` + motivo, com "Tentar de novo"); em "Adicionar site" a falha volta como mensagem e nada é gravado | No cadastro o site é opcional; no "Adicionar" o usuário está olhando e corrige na hora |
| D9 | **P1-2:** botão "Ler agora / Tentar de novo" em documentos de site ainda não lidos | Cobre os documentos que ficaram `pending` antes desta correção (inclusive em produção) |
| D10 | **P1-3:** botões "Gerar relatório" e "Gerar proposta" **dentro** do Registro, chamando os endpoints `/report` e `/proposal` do engine, em vez de um link para o painel ao vivo | O painel mostra "Gravando/Escutando" para uma reunião que já acabou; o endpoint já funciona pós-reunião (lê a transcrição do banco) |
| D11 | Testes com `node:test` + `node:assert`, executados por `bun run test` | Primeiros testes do repositório; tipam com `@types/node` (sem dependência nova) e o Bun já os executa |

## Tarefas

- [x] Confirmar no código atual que P1-1, P1-2 e P1-3 ainda existem
- [x] P1-1 — retomada do cadastro (etapa + campos do Perfil)
- [x] P1-2 — leitura do site (cadastro, bases de conhecimento, releitura)
- [x] P1-3 — gerar relatório/proposta pelo Registro, depois da reunião
- [x] Testes do leitor de site e do progresso do cadastro
- [x] Typecheck, testes, build e conferência das telas
- [ ] Commit, push e deploy na Vercel (aguardando o Sandro pedir)
- [ ] Conferência manual em produção, logado (ver "Depois de publicar")

## Critérios de aceite (do relatório de QA)

- [x] **P1-1:** dado um workspace com `onboarding_state.perfil = true`, ao carregar `/onboarding` o wizard abre na etapa seguinte (ou na etapa em que o usuário estava) e o Perfil volta preenchido — nunca força redigitação.
- [x] **P1-2:** um documento `source_type='url'` recém-criado não fica mais `pending` para sempre: nasce `ready` com `meta.raw_text` preenchido, ou `error` com o motivo e botão para tentar de novo.
- [x] **P1-3:** com `meeting.status` diferente de `in_call` e sem relatório, `/app/meetings/{id}/registro` oferece o botão que gera o relatório (e outro para a proposta), independente do status.

## File List

**Novos**
- `apps/web/src/app/onboarding/progress.ts` — etapas, `resolveInitialStep`, `buildSavedProfile` (módulo puro, usado por server e client)
- `apps/web/src/app/onboarding/progress.test.ts`
- `apps/web/src/lib/site-text.ts` — `readSiteText`, proteção SSRF, HTML → texto, `siteDocumentFields`
- `apps/web/src/lib/site-text.test.ts`
- `apps/web/src/lib/engine-control.ts` — `engineHttpUrl`, `signControlToken` (antes copiados dentro das páginas)
- `docs/stories/p1-fluxo-tester.story.md`

**Alterados**
- `apps/web/src/app/onboarding/page.tsx` — lê `onboarding_state` e os dados já salvos; `maxDuration = 30`
- `apps/web/src/app/onboarding/onboarding-flow.tsx` — etapa inicial, rascunho do Perfil no pai, botão de leitura do site
- `apps/web/src/app/onboarding/flow-actions.ts` — `saveProfileStep` lê o site (por último, fail-soft); nova `saveOnboardingStepAction`
- `apps/web/src/app/app/context/actions.ts` — `addDocumentAction` lê o site; nova `readUrlDocumentAction`
- `apps/web/src/app/app/context/context-manager.tsx` — botão "Ler agora / Tentar de novo" e motivo do erro
- `apps/web/src/app/app/context/page.tsx` — seleciona `error_detail`; `maxDuration = 30`
- `apps/web/src/app/app/meetings/[id]/registro/page.tsx` — assina o token de controle
- `apps/web/src/app/app/meetings/[id]/registro/registro-view.tsx` — botões de geração pós-reunião
- `apps/web/src/app/app/meetings/[id]/page.tsx` — passa a usar `lib/engine-control` (sem mudança de comportamento)
- `package.json` (raiz) — script `test`

**Não mudam:** `services/meeting-engine` (o engine em produção já serve), `supabase/migrations` (nenhuma migração), extensão Chrome.

## Verificação (evidência real, 2026-11-24)

1. `bun run typecheck` → PASS (shared, meeting-engine, web).
2. `bun run test` → **18 pass, 0 fail** (2 arquivos). O teste achou e corrigiu um defeito do próprio leitor (links com `#` eram ignorados).
3. `NODE_ENV=production next build` em `apps/web` → PASS, 24 rotas (inclui `/onboarding`, `/app/context`, `/app/meetings/[id]/registro`).
   Obs.: com o `NODE_ENV=development` que esta máquina exporta, o build local para no prerender de `/500` — é do ambiente, não do código (a Vercel usa `production`).
4. Leitor de site contra a internet real: `https://2020agency.co` → 5 páginas, 7.363 caracteres, 0,4s; `https://www.iana.org` → 3 páginas; `http://localhost:3000` e domínio inexistente → recusados com mensagem clara.
5. Telas conferidas no app rodando localmente, com dados fictícios (rota temporária de pré-visualização, já apagada):
   - cadastro com `{perfil:true}` → abre em "Etapa 2 — Conhecimento", Perfil marcado "Concluído";
   - `{perfil:true, step:'clones'}` → abre em "Etapa 3"; `{perfil:true, step:'perfil'}` → Perfil com todos os campos e chips preenchidos; `{}` → Perfil vazio;
   - lista de documentos: site `pending` → "Ler agora"; `error` → motivo + "Tentar de novo"; `ready` → sem botão (no cadastro e em Bases de conhecimento);
   - registro sem relatório → "Gerar relatório" (vira "Gerando relatório…", desabilita os dois botões, chama `POST /report?token=…`) e "Gerar proposta"; erro do engine aparece embaixo do botão; com relatório → só "Gerar proposta"; sem transcrição → explica e não mostra botão; engine indisponível → explica.

**Não verificado localmente:** o fluxo logado de ponta a ponta contra o banco real (exige a senha/sessão do Sandro) e a geração de relatório contra o engine real (o teste de tela usou um engine falso).

## Depois de publicar (conferência manual, logado)

1. Em `/onboarding`: preencher o Perfil com o site, clicar "Continuar", dar F5 → deve voltar na etapa 2; clicar em "Perfil" na lateral → campos preenchidos.
2. Na etapa 2, o documento "Site da empresa" deve aparecer como "pronta". Se houver um antigo "na fila", clicar "Ler agora".
3. Abrir o Registro de uma reunião encerrada sem relatório → "Gerar relatório" deve trazer o resumo em ~30s.

## Fora do escopo (follow-ups anotados, não corrigidos)

- Documentos de **texto** e o **perfil do onboarding** também nascem `pending` e aparecem como "na fila", embora já sejam usados pelo engine (só o rótulo está errado; exige ajustar o insert + uma atualização dos registros existentes).
- O engine corta o contexto em 9.000 caracteres somando toda a base (`persistence.ts`, `loadContext`) — bases grandes precisam de busca por relevância (a tabela `document_chunks` já existe para isso).
- CI (`.github/workflows/ci.yml`) roda só o typecheck — incluir `bun run test` (alçada do @devops).
- `apps/web/src/app/onboarding/wizard.tsx` (código morto, P2-2 do QA) ainda carrega o texto antigo "Vamos ler o site inteiro".
- Com o preflight do Tailwind desligado, botões sem cor de fundo aparecem cinza (padrão do navegador) em várias telas; os botões novos usam `bg-transparent`.
- Leitor de site: a checagem de endereço e a requisição resolvem o DNS em momentos diferentes (risco residual de *DNS rebinding*); fixar o IP exigiria um dispatcher próprio.
- Relatório automático pós-reunião no modo robô (item 9b do QA) e `RECALL_WEBHOOK_SECRET` ausente na Vercel continuam pendentes.
