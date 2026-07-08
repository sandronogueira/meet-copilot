# Validação de Fluxo — Meet Copilot (visão de tester novo convidado por e-mail/backoffice)

**Autor:** Pax (PO) · **Método:** User-Journey Walkthrough + Implicit-Prerequisite Hunting, evidência em código (arquivo:linha) + curl de produção. Nenhum código alterado, nenhuma conta criada.
**Nota de contexto importante:** este repositório estava sendo editado por outro agente **durante esta validação** (story `docs/stories/self-service-usage.story.md`, executor "Sonnet 5"). Achados estão marcados como **PRODUÇÃO** (o que o tester vive hoje em `meet.2020agency.co`) ou **WORKING TREE** (código local não commitado/não deployado, presente no momento da leitura). Isso muda o veredito — ver §1.

---

## 1. Veredito

**NO-GO hoje (produção) · GO condicional após deploy do working tree + 2 verificações manuais.**

O maior risco da jornada — *o tester não tem como saber que precisa da extensão Chrome, nem como instalá-la* — já tinha sido identificado pela curadoria (ver `docs/stories/self-service-usage.story.md`, decisão D7) e está **sendo corrigido agora mesmo**, no working tree local:

- `apps/web/src/app/app/install/page.tsx` — página com zip + passo a passo (criada literalmente durante esta revisão, 18:27).
- `apps/web/public/downloads/meet-copilot-extension.zip` — zip da extensão, já commitável (verificado com `unzip -l`, 9 arquivos, contém `manifest.json`).
- `apps/web/src/app/app/layout.tsx` — nav agora tem "Instalar extensão" e "Consumo".
- `apps/web/src/app/backoffice/actions.ts` / `backoffice-view.tsx` — convite por e-mail (`inviteTesterAction`) somado à criação direta.

**Nenhuma dessas mudanças está commitada nem deployada** (`git status` mostra tudo como modificado/untracked; `git diff --stat` confirma). Produção (`meet.2020agency.co`, confirmado via curl) ainda não tem nada disso — hoje, um tester convidado cai exatamente no buraco que a curadoria descreveu: login funciona, onboarding funciona, mas ninguém no produto diz "instale a extensão", e não há como baixá-la.

**Antes de convidar qualquer tester:**
1. Commitar + typecheck (`tsc -p apps/web --noEmit`) + deploy do working tree atual.
2. Rodar as 2 verificações manuais do §4 que o código não prova (Recall.ai configurado? zip serve 200 em produção?).
3. Decidir e comunicar ao tester **qual dos dois caminhos de iniciar reunião usar** (ver P0-2 abaixo — isso não está no escopo da story em andamento e continua sem solução).

---

## 2. Jornada passo a passo

| # | Passo | Status | Evidência |
|---|---|---|---|
| 1a | Backoffice cria tester com senha (D1) | OK | `apps/web/src/app/backoffice/actions.ts:41-78` — `createUser` com `email_confirm:true` (sem SMTP), senha de 16 chars mostrada **uma única vez** na UI (`backoffice-view.tsx:180-203`, texto "Anote — não será exibida de novo") |
| 1b | Backoffice convida por e-mail (D6, working tree) | OK (não deployado) | `backoffice/actions.ts:92-126` `inviteTesterAction` → `admin.auth.admin.inviteUserByEmail(..., redirectTo: '.../auth/callback')`. Texto do e-mail é customizado no Supabase Dashboard (Auth → Email Templates), fora do código — **verificar manualmente se foi personalizado**, senão o tester recebe o e-mail padrão em inglês do Supabase |
| 1c | Trigger provisiona workspace/profile/base | OK | `supabase/migrations/0002_experts_onboarding.sql:107-109` — trigger síncrono em `auth.users`, dispara para os dois caminhos (create/invite) |
| 1d | Login com e-mail+senha | OK | `apps/web/src/app/(auth)/login/page.tsx` + `actions.ts:23-40`. Produção: `curl /login` → 200 |
| 2 | Gate de onboarding no primeiro acesso | OK | `apps/web/src/app/app/layout.tsx:19-27` — redireciona para `/onboarding` se `workspace.onboarding_completed_at` for nulo, **independente** de para onde o login/callback mandou o usuário (blindagem correta) |
| 3 | Onboarding: Perfil → Conhecimento → Clones → Config | FRICÇÃO | Fluxo ativo é `onboarding-flow.tsx` (client, 4 abas). `useState<Step>('perfil')` **hardcoded** (`onboarding-flow.tsx:54`) — qualquer refresh de página durante o onboarding volta para a aba "Perfil" com os campos de descrição/segmento/metodologia/tom/objeções/ICP **em branco**, mesmo que `onboarding_state.perfil` já esteja salvo no banco. Bases e clones já escolhidos não se perdem (persistem direto no banco a cada ação), só o texto narrativo do Perfil |
| 3b | Onboarding promete ler o site da empresa | FRICÇÃO (P1, ver §3) | `onboarding-flow.tsx:192-193` ("Vamos ler o site inteiro...") → documento `source_type='url'` cai com `status` padrão `'pending'` (`supabase/migrations/0001_core_schema.sql:91-92`) e **nunca é processado** — nenhum worker/scraper existe no repo (grep por `cheerio/puppeteer/playwright/fetchUrl` = zero resultados). Fica "na fila" para sempre (`onboarding-flow.tsx:281` label `pending: 'na fila'`) |
| 4 | Descobrir que precisa da extensão Chrome | **BLOQUEIO em produção / OK no working tree não deployado** | Produção: zero menção a "extensão"/"instalar"/Chrome em qualquer tela do app (`grep -rn "extens\|chrome.google.com\|webstore" apps/web/src/app` só retorna comentários internos de `war-room.tsx`/`panel/[id]`, nunca copy visível ao usuário). Working tree: `apps/web/src/app/app/install/page.tsx` (novo) resolve isso — zip + 5 passos + link "Instalar extensão" no nav (`app/layout.tsx:54-56`) |
| 4b | Instalar via "Carregar sem compactação" | FRICÇÃO estrutural aceita pela curadoria | Não existe Chrome Web Store listing (`apps/extension/manifest.json` sem metadados de loja). Instalação exige Modo do Desenvolvedor + apontar para pasta descompactada — cinco cliques técnicos para um tester "nunca viu o produto". A própria story (`self-service-usage.story.md`, D7) já assume isso como trade-off temporário |
| 5a | Iniciar reunião — caminho A (dashboard, bot Recall.ai) | **RISCO NÃO VERIFICÁVEL EM CÓDIGO** | `apps/web/src/app/app/meeting-launcher.tsx` é o **único CTA visível no dashboard** ("Cole o link do Meet, Zoom ou Teams"). Chama `POST /api/meetings` → `apps/web/src/app/api/meetings/route.ts:75-84` retorna 503 `RECALL_NOT_CONFIGURED` com mensagem técnica ("falta a chave da Recall.ai... RECALL_API_KEY") se a env não estiver setada. `.env.example` mostra a chave em branco localmente — **precisa verificar se está configurada na Vercel de produção** |
| 5b | Iniciar reunião — caminho B (extensão, side panel) | FRICÇÃO | `apps/extension/panel.js:109-214`: exige (i) estar na aba do Meet, (ii) já ter clicado no ícone da extensão nessa aba (concede `activeTab`), (iii) permissão de microfone via aba separada (`mic-permission.html`) se ainda não concedida — até 3 ações + 2 trocas de aba na primeira vez. MVP restrito a Google Meet (`api/extension/start/route.ts:45-49` rejeita Zoom/Teams com erro "MVP da extensão: Google Meet primeiro") |
| 5c | Dois caminhos sem nenhuma ponte entre si | **BLOQUEIO potencial (P0, ver §3)** | Nada no dashboard (`app/page.tsx`) e nada na página de instalação (`install/page.tsx`) explica quando usar qual, nem redireciona um tester que colou um link de Zoom/Teams para a extensão (que só funciona com Meet) |
| 5d | Bot precisa ser admitido na call (Recall) | Sem aviso na UI | Nenhuma copy em `meeting-launcher.tsx` avisa que o anfitrião precisa aceitar o bot na sala de espera. Sem isso, o tester pode achar que "não aconteceu nada" |
| 6 | Status da reunião ao vivo no dashboard | FRICÇÃO leve | `app/page.tsx` é server component sem realtime — status (`joining`→`in_call`→`processing`) só atualiza com refresh manual da página; `router.refresh()` só roda uma vez, logo após o POST |
| 7 | Transcrição + insights ao vivo (war room) | OK | `war-room.tsx` — feed cronológico, troca de clone em tempo real, modo discreto para compartilhar tela. Bem construído |
| 8 | Gerar relatório/proposta **durante** a call | OK | `war-room.tsx:155-201` — chama `/report` e `/proposal` do meeting-engine, com fallback de 90s para conexões instáveis (comentário explica bem o motivo) |
| 9 | Gerar relatório/proposta **depois** de a call ter terminado | **BLOQUEIO (P1, ver §3)** | `registro-view.tsx:113-124` só mostra o link "painel ao vivo" quando `status === 'in_call'`. Meeting termina com `status='done'` (`services/meeting-engine/src/lib/persistence.ts:383-390`) ou `'processing'` (webhook Recall, `api/webhooks/recall/route.ts:26-30`) — nesses casos o link some e a página só exibe o texto estático "gere pelo painel da reunião com Finalizar com Relatório" **sem nenhum link clicável**. O endpoint em si continua funcionando (`meeting-engine/src/index.ts:131-169` lê a transcrição do banco, não depende de sessão viva) — só a UI não expõe o caminho |
| 9b | Pipeline automático de relatório pós-call (bot mode) | Não implementado | `api/webhooks/recall/route.ts:81` — `// TODO(F5): status 'processing' → enfileirar job report_generate na tabela jobs`. Se o tester não clicar "Finalizar" **durante** a call, para reuniões via bot (Recall) não existe geração automática depois |
| 10 | Ver consumo (créditos/mês) | OK (não deployado) | `apps/web/src/app/app/usage/page.tsx` (novo) — barra de créditos, sem bloqueio de uso (D5 intencional) |
| 11 | Trocar clone / segunda reunião | OK | `war-room.tsx` picker de especialistas; dashboard lista reuniões via `list_meetings_overview` RPC |

---

## 3. Top gaps priorizados

### P0-1 — Working tree resolve, mas nada foi deployado
**Dado** um tester recebe credencial hoje e acessa `meet.2020agency.co`, **quando** ele completa onboarding e chega no dashboard, **então** não existe nenhuma pista (nav, banner, copy) de que uma extensão Chrome é necessária, nem onde buscá-la — confirmado por curl em produção e grep de código-fonte.
**Como verificar:** `curl -s -o /dev/null -w '%{http_code}' https://meet.2020agency.co/downloads/meet-copilot-extension.zip` deve retornar `200` com `content-length` > 10000 (hoje: 404, arquivo não existe em prod). `curl` em `/app/install` deve redirecionar para login (30x) e, autenticado, renderizar a página.
**Ação:** commitar + deployar o working tree atual (`install/page.tsx`, `usage/page.tsx`, zip, nav) **antes** de convidar qualquer tester. Não é trabalho novo — já está pronto, só falta subir.

### P0-2 — Dois caminhos para iniciar reunião, nenhuma orientação de qual usar
**Dado** um tester chega ao dashboard depois de instalar (ou não) a extensão, **quando** ele vê o único campo "Cole o link do Meet, Zoom ou Teams" em `meeting-launcher.tsx`, **então** ele não tem como saber que esse caminho (bot Recall.ai) é diferente do caminho da extensão, que exige host admitir o bot, e que pode retornar um erro técnico ("RECALL_API_KEY") se a integração não estiver ativa no ambiente.
**Como verificar:** (1) confirmar nas envs da Vercel de produção se `RECALL_API_KEY`, `ENGINE_WS_URL`, `ENGINE_WS_SECRET` estão setadas — sem isso, `/api/meetings` sempre 503 (`api/meetings/route.ts:75-84`); (2) com um Google Meet real, colar o link no dashboard e conferir se o bot aparece na sala de espera e se, ao admitir, o status muda para `in_call` sem exigir refresh manual.
**Ação recomendada:** decidir agora (produto, não código) se para este piloto o caminho oficial é só a extensão — e, se for, esconder/desabilitar temporariamente o campo do dashboard ou adicionar copy explícita ("recomendado: use a extensão — instale em Configurações → Instalar extensão"). Sem isso, testers vão reportar bugs que são, na verdade, confusão de fluxo.

### P1-1 — Onboarding não retoma de onde parou
**Dado** um tester preenche a etapa "Perfil" do onboarding (nome, empresa, metodologia, objeções, ICP) e a conexão cai ou ele atualiza a página antes de terminar as 4 etapas, **quando** ele volta para `/onboarding`, **então** o formulário reinicia na etapa "Perfil" com todos os campos em branco (exceto nome), obrigando a redigitar tudo — mesmo o servidor já tendo salvo `onboarding_state.perfil = true`.
**Evidência:** `apps/web/src/app/onboarding/onboarding-flow.tsx:54` `useState<Step>('perfil')` nunca lê `workspace.onboarding_state`; `apps/web/src/app/onboarding/page.tsx` busca esse estado do banco mas não o repassa para o componente.
**Como verificar:** logar como tester, preencher Perfil, dar F5 na aba, confirmar que os campos de descrição/segmento/metodologia/objeções/ICP vieram vazios.
**AC:** dado um workspace com `onboarding_state.perfil = true`, quando a página `/onboarding` carrega, então o wizard deve abrir na aba "Conhecimento" (ou pré-preencher os campos de Perfil a partir de `onboarding_state.step1`/`perfil`), nunca forçando redigitação de texto já salvo.

### P1-2 — "Vamos ler o site da empresa" não acontece
**Dado** um tester cola a URL do site da empresa no onboarding (campo opcional, mas destacado com "Vamos ler o site inteiro e absorver serviços, cases e diferenciais"), **quando** a reunião acontece, **então** o copiloto nunca teve acesso a nenhum conteúdo desse site — o documento fica com `status='pending'` para sempre porque não existe nenhum worker de scraping no repositório.
**Evidência:** `supabase/migrations/0001_core_schema.sql:91-92` (default `'pending'`), `services/meeting-engine/src/lib/persistence.ts:164-180` (`loadContext` só lê `meta.raw_text`, que nunca é preenchido para `source_type='url'`), zero resultados de grep por bibliotecas de scraping no monorepo.
**Como verificar:** adicionar uma URL de site em Bases de Conhecimento, aguardar alguns minutos, conferir se o status continua "na fila" indefinidamente.
**AC:** dado um documento `source_type='url'` recém-criado, quando dias se passam sem nenhum job processá-lo, então isso é um bug conhecido — ou (a) implementar o worker de leitura de URL antes do piloto, ou (b) remover/renomear temporariamente a promessa de copy no onboarding para não gerar expectativa falsa no tester.

### P1-3 — Sem caminho de UI para gerar relatório/proposta depois que a reunião terminou
**Dado** uma reunião (bot ou extensão) chega ao fim sem o tester ter clicado "Finalizar com Relatório"/"Gerar Proposta" durante a call, **quando** ele abre "Registro da sessão" depois, **então** vê apenas o texto "gere pelo painel da reunião" sem nenhum link — o link para o painel só aparece quando `status === 'in_call'` (`registro-view.tsx:113-124`), e o status vira `'done'`/`'processing'` assim que a reunião acaba.
**Evidência:** endpoint de finalização (`meeting-engine/src/index.ts:131-169`) funciona perfeitamente pós-call (lê transcrição do banco), então é puramente um gap de UI, fácil de corrigir.
**Como verificar:** terminar uma reunião sem clicar em Finalizar, abrir o Registro, confirmar que não há como chegar ao botão de gerar relatório.
**AC:** dado `meeting.status` diferente de `in_call` e sem `reports` associado, quando o tester abre `/app/meetings/{id}/registro`, então deve haver um link/botão que leve a `/app/meetings/{id}` (ou exponha os botões de Finalizar diretamente na página de registro), independente do status.

### P2-1 — Zip da extensão commitado manualmente, sem checagem de drift
`apps/extension/README.md` (working tree) documenta o comando de regeneração do zip, mas nada garante que alguém lembre de rodá-lo após mudar `panel.js`/`background.js`. Sugestão: um script `npm run build:extension-zip` chamado no pre-commit ou no deploy, comparando hash do zip com o conteúdo da pasta.

### P2-2 — `wizard.tsx` morto no código
`apps/web/src/app/onboarding/wizard.tsx` (com `saveStep1..5` de `actions.ts`) não é importado por lugar nenhum — `onboarding/page.tsx` usa `onboarding-flow.tsx`. Código morto, risco de confundir o próximo dev que mexer em onboarding achando que é o fluxo ativo. Sem urgência.

### P2-3 — Texto do e-mail de convite fora do controle do código
`inviteTesterAction` depende do template "Invite user" do Supabase Dashboard (Auth → Email Templates), que só o Sandro acessa. Se nunca foi customizado, o tester recebe o e-mail padrão em inglês do Supabase, pouco alinhado à marca. Verificar/ajustar antes do primeiro convite por e-mail.

---

## 4. O que testar manualmente (código não prova)

1. **Recall.ai realmente configurado em produção?** Colar um link real de Google Meet no dashboard (`app/page.tsx` → "Entrar com o copiloto") e confirmar se o bot aparece na sala de espera em vez de retornar 503.
2. **Zip da extensão serve em produção com o conteúdo certo** — depois do deploy: `curl -s -o /tmp/ext.zip https://meet.2020agency.co/downloads/meet-copilot-extension.zip && unzip -l /tmp/ext.zip` deve listar `manifest.json`, `panel.html`, `background.js`, `offscreen.js`.
3. **Instalação ponta a ponta em máquina "limpa"** (não a do Sandro): baixar o zip, `chrome://extensions`, Modo do desenvolvedor, Carregar sem compactação, fixar ícone, abrir Meet, clicar ícone, permitir microfone na aba separada, voltar e clicar Iniciar de novo — cronometrar quantos minutos/cliques um humano não-técnico leva até a transcrição aparecer.
4. **E-mail de convite** — dar `Convidar por e-mail` para um endereço real e ler o e-mail que chega (idioma, remetente, link funcionando, redirecionamento correto para onboarding após clicar).
5. **Bot precisa ser admitido** — confirmar experimentalmente se o Recall bot entra direto ou fica em sala de espera esperando o host aceitar, e cronometrar quanto tempo isso leva sem feedback na UI.
6. **Modo discreto ao compartilhar tela** (`war-room.tsx` botão "olho cortado") — validar visualmente que nenhuma sugestão da IA aparece na tela compartilhada, já que essa é uma promessa central do produto ("saia como especialista" sem o cliente perceber a IA).
7. **Reset de senha / bloqueio de usuário no backoffice** — fluxos existem no código mas não foram exercitados nesta validação (evitamos criar contas reais).
8. **Limite de créditos "sem enforcement"** (`usage/page.tsx`, D5) — confirmar visualmente que passar de 100% não trava nada, só muda a cor da barra para vermelho, como o código promete.
