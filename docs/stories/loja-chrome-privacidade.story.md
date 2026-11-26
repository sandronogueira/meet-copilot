# Story: Política de privacidade no site e aviso com aceite na extensão

**Status:** Site publicado em 2026-11-26, com a política de privacidade no ar. Extensão 0.3.0 pronta e testada, ainda não enviada à loja. Faltam o teste de uma reunião real e a parte do Sandro na loja (ver "O que falta").
**Origem:** o Sandro respondeu "Sim, preparar" em 2026-11-26 à pergunta "Preparo agora o que falta no site e na extensão para poder enviar à loja?".
**Executor:** Fable 5.2
**Story anterior:** `docs/stories/loja-chrome.story.md` (pacote, ficha e lista de requisitos)
**Documento principal:** `docs/LOJA-CHROME.md`

## Por quê

A Chrome Web Store recusa extensão que lida com dados do usuário sem três coisas, e o projeto não tinha nenhuma:

1. uma política de privacidade pública, com link informado no painel da loja;
2. a declaração de Uso Limitado em uma página do site ligada à página inicial;
3. um aviso dizendo o que é coletado e para quê, com aceite do usuário antes da coleta.

## Critérios de aceite

- [x] Existe a página `/privacidade`, em português, coerente com o que o código faz (o que coleta, para que usa, com quem compartilha, por quanto tempo guarda, como pedir exclusão)
- [x] A página traz a declaração de Uso Limitado e um resumo em inglês para o revisor do Google
- [x] A página inicial tem link para a política (a regra pede link a partir da página inicial)
- [x] A política não vai ao ar incompleta nem sem aprovação: sem o nome do responsável, sem o e-mail de contato ou sem a aprovação do Sandro, a página e os links não aparecem no site publicado
- [x] A extensão mostra o aviso antes da primeira captura e só captura depois do aceite
- [x] Sem aceite, nem o painel nem o service worker iniciam a captura
- [x] O usuário consegue rever o aviso e retirar a autorização
- [x] O pacote da loja foi refeito com a versão nova e carrega sem erro
- [x] Testes, checagem de tipos e build do site passam
- [x] Nenhum travessão em texto que pessoas leiam

## Decisões

| # | Decisão | Racional |
|---|---------|----------|
| D1 | A política diz que os dados ficam na conta até o usuário pedir a exclusão. **Não promete os 90 dias** | O banco tem `workspaces.retention_days` (90) e `meetings.retention_until`, mas nenhuma rotina usa esses campos. Prometer 90 dias seria mentir. Apagar sozinho em 90 dias é decisão de produto do Sandro (o vendedor perde o histórico) |
| D2 | Nome do responsável, e-mail de contato e data da aprovação do texto (`approvedOn`) ficam em `apps/web/src/lib/privacy.ts`. Enquanto um deles estiver vazio, `/privacidade` responde 404 em produção e os links somem. Em desenvolvimento a página abre como rascunho | São dados e uma decisão que só o Sandro pode dar (Constitution, artigo IV: não inventar). Outras sessões fazem deploy deste site, então a trava impede que a política vá ao ar pela metade ou sem a aprovação dele. A aprovação entrou na trava quando o nome e o e-mail foram preenchidos: sem ela, o próximo deploy publicaria um texto que ele ainda não leu |
| D3 | A autorização mora em `apps/extension/consent.js`, usado pelo painel e pelo service worker | Fonte única para a versão do aviso. O service worker confere a autorização de novo antes de capturar, então a captura não depende só da tela |
| D4 | `CONSENT_VERSION` no `consent.js`. Subir o número faz o aviso aparecer de novo para quem já aceitou | A regra da loja pede novo aviso quando a prática de dados muda |
| D5 | Antes do aceite a extensão não faz nenhuma chamada de rede | O aviso vem antes de qualquer envio de dado |
| D6 | "Agora não" fecha o painel sem registrar nada | Sair ou fechar não pode valer como aceite |
| D7 | A versão da extensão sobe de 0.2.0 para 0.3.0 | O comportamento mudou. O zip manual em uso continua sendo o 0.2.0 |
| D8 | O zip manual (`apps/web/public/downloads/meet-copilot-extension.zip`) **não foi refeito** | Ele está em uso. Refazer muda o que os vendedores baixam e só vale depois de deploy. Fica para quando o Sandro pedir |
| D9 | O script da loja apaga pacotes de versões anteriores em `dist/chrome-web-store/` | Evita enviar o zip antigo por engano |
| D10 | A Recall.ai não entra na lista de serviços da política | O caminho do robô existe no código, mas responde "ainda não está ativo" sem a chave. Se for ligado, a política precisa ser atualizada |
| D11 | A política inclui o compromisso de que ninguém da equipe lê transcrições, salvo com autorização, por segurança ou por lei | É exigência da regra de Uso Limitado. O painel administrativo de hoje só lê perfis e chaves de IA, não lê transcrições. Depende da aprovação do Sandro |
| D12 | Estilos da página em `globals.css` (bloco `.legal`), no padrão das páginas públicas | A página inicial e o login usam as classes do `globals.css`, não o Tailwind das telas internas |

## Tarefas

- [x] Conferir no código o que é coletado, guardado e enviado a terceiros
- [x] Conferir a regra de 90 dias (não existe rotina que apague)
- [x] `apps/web/src/lib/privacy.ts` e teste
- [x] Página `/privacidade` e estilos
- [x] Links na página inicial, no login e no cadastro
- [x] `consent.js`, aviso no painel e trava no service worker
- [x] Versão 0.3.0 e pacote da loja refeito
- [x] Testes, tipos, build e carga da extensão num Chromium de teste
- [x] Capturas de tela para a ficha da loja (painel refeito e aviso novo)
- [x] Atualizar `docs/LOJA-CHROME.md` e a story anterior
- [x] Preencher o e-mail de contato (informado pelo Sandro em 2026-11-26)
- [x] Preencher o nome do responsável ("Agência 2020", informado pelo Sandro em 2026-11-26)
- [x] Trava de aprovação: campo `approvedOn` e teste
- [x] Aprovação do texto da política: o Sandro respondeu "Aprovo" em 2026-11-26, data registrada em `approvedOn`
- [x] Commit e deploy do site: feitos em 2026-11-26 com o "Sim, publicar" do Sandro (ver "Publicação")
- [ ] Teste de uma reunião real com o pacote da loja

## File List

**Novos**
- `apps/web/src/lib/privacy.ts`: dados da política que só o dono informa, e a regra "pronta para publicar"
- `apps/web/src/lib/privacy.test.ts`: 7 testes
- `apps/web/src/app/privacidade/page.tsx`: a política
- `apps/extension/consent.js`: leitura, registro e retirada da autorização
- `docs/loja-chrome/captura-3-aviso.png`: captura do aviso para a ficha
- `docs/stories/loja-chrome-privacidade.story.md`

**Alterados**
- `apps/web/src/app/globals.css`: bloco `.legal`
- `apps/web/src/app/page.tsx`, `apps/web/src/app/(auth)/login/page.tsx`, `apps/web/src/app/(auth)/signup/page.tsx`: link para a política, só quando ela está pronta
- `apps/extension/panel.html`: tela do aviso, link "Privacidade e autorização", texto de ajuda de 0,74 para 0,75 rem (apontado pela checagem de design)
- `apps/extension/panel.js`: mostra o aviso antes da tela inicial, registra aceite e retirada, confere a autorização no Iniciar
- `apps/extension/background.js`: recusa a captura sem autorização (`CONSENT_REQUIRED`)
- `apps/extension/manifest.json`: versão 0.3.0
- `apps/extension/README.md`: passo do aviso e regra do `CONSENT_VERSION`
- `scripts/chrome-web-store/build.mjs`: apaga pacotes de versões anteriores
- `docs/loja-chrome/captura-1-painel.png`: refeita com a versão 0.3.0
- `docs/LOJA-CHROME.md`, `docs/stories/loja-chrome.story.md`

**Gerados, fora do git**
- `dist/chrome-web-store/meet-copilot-loja-0.3.0.zip` e a pasta de mesmo nome (o 0.2.0 foi apagado pelo script)

**Não tocados**
- `apps/web/public/downloads/meet-copilot-extension.zip` (zip manual, versão 0.2.0)

## Verificação (2026-11-26)

1. `bun run test`: 44 passam, 0 falham (eram 38; 6 novos).
2. `bun run typecheck`: sem erros.
3. `NODE_ENV=production bun run build` em `apps/web`: passa. Com os dois dados vazios, `/privacidade` sai com status 404 e a página inicial não cita privacidade.
4. Site local com os dois dados vazios: `/privacidade` abre como rascunho, com as pendências marcadas, e não há link na página inicial, no login nem no cadastro.
5. Site local com dados de exemplo (preenchidos só durante o teste e devolvidos ao original, conferido com `cmp`): `/privacidade` abre sem rascunho, com o e-mail clicável, e o link aparece na página inicial, no login e no cadastro. Sem erro de script e sem rolagem lateral, em 1280 px e em 390 px.
6. Extensão: zip 0.3.0 extraído numa pasta nova e carregado no Chromium 145 de teste, com perfil descartável. 28 de 28 conferências passaram, no pacote da loja e na pasta de origem. A tabela está em `docs/LOJA-CHROME.md`, seção 3.
7. Os 9 arquivos de código do pacote são idênticos aos de `apps/extension` (`cmp`). `git status` não mostra mudança no zip manual.
8. Nenhum travessão nos arquivos novos nem nos textos visíveis dos arquivos alterados.

9. Com os dados reais preenchidos (responsável e e-mail informados pelo Sandro): 44 testes e a checagem de tipos passam; o build de produção gera `/privacidade` com status 200, com o nome, o e-mail clicável e a declaração de Uso Limitado, sem aviso de rascunho; a página inicial, o login e o cadastro trazem o link. Conferido também com o site compilado servido localmente (`next start`, porta 3111, já encerrado), em 1280 px e em 390 px, sem erro de script.
10. Depois disso entrou a trava de aprovação (`approvedOn` vazio): 45 testes passam, a checagem de tipos passa, e o build de produção voltou a gerar `/privacidade` com status 404 e sem links na página inicial, no login e no cadastro. 11. Com a aprovação registrada (`approvedOn: '2026-11-26'`): 45 testes e a checagem de tipos passam, e o build de produção gera `/privacidade` com status 200, com o nome, o e-mail clicável e a declaração de Uso Limitado, sem aviso de rascunho, e com o link na página inicial, no login e no cadastro. É o estado atual.

**Não verificado:** captura de áudio numa reunião real e o clique no ícone abrindo o painel lateral (o teste roda sem janela).

**Ambiente:** a prévia embutida do app não abriu o site (o macOS negou o acesso à pasta em Downloads). O site foi conferido com um servidor local temporário na porta 3111, já encerrado.

## Publicação (2026-11-26)

Feita com o "Sim, publicar" do Sandro, depois de ele informar o responsável e o contato e aprovar o texto.

1. **Código:** três registros enviados ao `main`, só com os arquivos deste trabalho: `d0b0892` (extensão), `e897b3b` (site) e `cef024c` (script do pacote da loja, guia, capturas e stories). Os arquivos soltos de outras sessões ficaram de fora.
2. **Site:** publicado na Vercel a partir de cópia limpa do `cef024c` (`git archive`), deploy `meet-copilot-2y1za6xyo`, apelidado para `meet.2020agency.co`.
3. **Conferido no endereço público:** `/privacidade` responde 200, com "Agência 2020", o e-mail clicável e a declaração de Uso Limitado em português e em inglês, sem aviso de rascunho e sem travessão. A página inicial, o login e o cadastro têm o link, e o clique na página inicial leva à política. Em 1280 px e em 390 px, sem erro de script e sem rolagem lateral.
4. **O que já existia continua igual:** `/login` e `/signup` respondem 200, `/app` e `/app/install` redirecionam para o login, a API da extensão responde 401 sem login, e o zip manual no ar é idêntico ao do repositório (versão 0.2.0).
5. **Motor:** não mudou e não foi republicado.
6. **Loja:** nada foi enviado.

## O que falta

1. Resolvido em 2026-11-26: o Sandro informou o nome do responsável e o e-mail de contato, e os dois estão em `apps/web/src/lib/privacy.ts`.
2. Resolvido em 2026-11-26: o Sandro aprovou o texto e a data está em `approvedOn`.
3. Resolvido em 2026-11-26: site publicado e conferido (ver "Publicação").
4. Teste de uma reunião real com a pasta do pacote da loja.
5. Decisões que não bloqueiam o envio: apagar dados sozinho depois de um prazo, criar um botão para apagar reunião e encerrar conta, refazer ou aposentar o zip manual.

## Limitações conhecidas

- O aviso ocupa cerca de 990 px de altura num painel de 400 px de largura. Em telas menores o usuário rola para chegar ao botão de aceite.
- Hoje um pedido de exclusão de reunião ou de conta é atendido direto no banco, porque o site não tem esse botão.
- A política cita os serviços pelo que o código chama hoje. Trocar de provedor de IA, de banco ou de hospedagem exige atualizar a página.
