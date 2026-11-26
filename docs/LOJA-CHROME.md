# Meet Copilot na Chrome Web Store (item não listado)

**Situação em 2026-11-26:** pacote 0.3.0 pronto e testado, já com o aviso de privacidade e o aceite. A política de privacidade está no ar em https://meet.2020agency.co/privacidade desde 2026-11-26, aprovada pelo Sandro. Nada foi enviado à loja, nenhuma conta foi criada e nada foi pago.
**Objetivo:** o vendedor recebe um link, clica em "Usar no Chrome" e a extensão está instalada, sem "Modo do desenvolvedor".
**Stories:** `docs/stories/loja-chrome.story.md` (pacote e ficha) e `docs/stories/loja-chrome-privacidade.story.md` (política e aviso)

"Não listado" quer dizer: a extensão não aparece na busca da loja, mas qualquer pessoa com o link instala. Passa pela mesma análise do Google que um item público.

---

## 1. O que só o Sandro pode fazer

| # | O quê | Observação |
|---|-------|------------|
| 1 | Escolher a conta Google que será a dona da extensão | De preferência uma conta da agência, não a pessoal. Trocar depois dá trabalho |
| 2 | Ligar a verificação em duas etapas nessa conta | O Google exige antes de publicar |
| 3 | Entrar em https://chrome.google.com/webstore/devconsole, aceitar o contrato e pagar a taxa de cadastro | Taxa única, paga uma vez só. O valor conhecido é 5 dólares (ver seção 7) |
| 4 | Informar o nome do publicador e confirmar o e-mail de contato | O Google manda um e-mail de confirmação. Esse e-mail aparece para quem instala |
| 5 | Aprovar o texto da política de privacidade e pedir a publicação do site | **Feito em 2026-11-26.** O texto foi aprovado e o site foi publicado com a política. O nome do responsável (Agência 2020), o e-mail de contato e a data da aprovação estão em `apps/web/src/lib/privacy.ts`. O e-mail aparece na página e serve também de suporte |
| 6 | Criar no site uma conta de teste com e-mail e senha, já com o cadastro inicial concluído | É para o revisor do Google conseguir usar. A senha quem digita no painel é você |
| 7 | Enviar o pacote e preencher a ficha | Arquivo: `dist/chrome-web-store/meet-copilot-loja-0.3.0.zip`. Os textos estão prontos nas seções 4, 5 e 6 |
| 8 | Marcar as três declarações sobre uso de dados | São declarações suas ao Google (seção 5.5) |
| 9 | Na aba de distribuição, escolher "Não listado" e clicar em enviar para análise | |
| 10 | Acompanhar o e-mail e responder ao Google se pedirem ajuste | Se pedirem mudança, mande o texto do e-mail que eu preparo a resposta e a nova versão |
| 11 | Depois de aprovado, copiar o link da loja e me enviar | Com o link eu troco a página de instalação e os guias (seção 10) |

Posso preencher os campos da ficha junto com você, com a tela aberta. Criar a conta, aceitar o contrato, pagar, digitar senhas e clicar em enviar ficam com você.

**Antes do passo 7** falta uma coisa (detalhes na seção 8): um teste de reunião real com o pacote da loja. A política de privacidade já está no ar e o aviso com aceite dentro da extensão já está pronto.

---

## 2. O que o vendedor vai ver ao instalar

Ao clicar em "Usar no Chrome", o Chrome mostra este aviso (texto exato, lido no Chromium 145 em português):

> Ler e mudar seus dados em qualquer site

O aviso assusta, mas é o texto padrão do Chrome para qualquer extensão que captura o áudio de uma aba. Não dá para tirar sem tirar a captura do áudio. O Meet Copilot não lê o conteúdo das páginas: ele só captura o áudio da aba em que o vendedor clicou no ícone. Vale explicar isso no guia de instalação e na mensagem do WhatsApp.

---

## 3. O pacote

| Item | Valor |
|------|-------|
| Arquivo para enviar | `dist/chrome-web-store/meet-copilot-loja-0.3.0.zip` |
| Pasta para conferir ou carregar no Chrome | `dist/chrome-web-store/meet-copilot-loja-0.3.0/` |
| Como refazer | `bun run package:store` (ou `node scripts/chrome-web-store/build.mjs`) |
| Versão | 0.3.0 |
| Conteúdo | 14 arquivos: os 9 de código da extensão, o `manifest.json` da loja e 4 ícones |

A pasta `dist/` não entra no git: o pacote é refeito pelo comando acima sempre que preciso. O comando apaga o pacote da versão anterior, para existir um zip só.

**O zip manual em uso hoje não mudou.** `apps/web/public/downloads/meet-copilot-extension.zip` continua sendo a versão 0.2.0, sem o aviso. A pasta de origem (`apps/extension`) mudou em 2026-11-26: ganhou o aviso de privacidade com aceite e passou para a versão 0.3.0. Quem instalou pelo zip só recebe o aviso quando o zip for refeito e publicado, o que fica para quando o Sandro pedir (o comando está em `apps/extension/README.md`).

O manifest da loja é gerado só na hora de empacotar. Os arquivos `.js` e `.html` do pacote são idênticos aos da fonte, byte a byte.

### Diferenças entre o pacote da loja e o zip manual

| Diferença | Por quê |
|-----------|---------|
| Sem `http://localhost:3000/*` e `http://localhost:8080/*` | São endereços de desenvolvimento. A loja recusa permissão que o produto não usa |
| Sem a permissão `tabs` | Ver abaixo |
| Com ícones de 16, 32, 48 e 128 px | A loja exige o de 128 px dentro do pacote. Feitos a partir de `apps/web/src/app/icon.svg` (círculo ciano com a câmera) |
| Descrição curta trocada | A atual é um slogan. A loja pede um texto que descreva o que a extensão faz |
| Sem o `README.md` | Documentação interna |
| Versão 0.3.0, com o aviso de privacidade e o aceite | O zip manual é o 0.2.0, feito antes do aviso. A diferença some quando o zip manual for refeito |

### Por que a permissão `tabs` saiu do pacote da loja

A regra da loja é pedir o mínimo, e pedir a mais pode causar recusa. O único uso de `tabs` no código é ler o endereço da aba ativa para saber se é uma reunião do Meet (`panel.js`). A permissão do site `https://meet.google.com/*` já entrega isso.

Teste feito em 2026-11-25 (Chromium 145, perfil descartável):

| O que a extensão enxerga | Com `tabs` | Sem `tabs` |
|--------------------------|------------|------------|
| Endereço da aba do Meet | Sim | Sim |
| Endereço e título de abas de outros sites | Sim | Não |
| Aviso mostrado na instalação | O mesmo | O mesmo |

Ou seja: sem `tabs` a extensão funciona igual e enxerga menos da navegação do usuário. Para voltar atrás, basta esvaziar a lista `STORE_DROPPED_PERMISSIONS` em `scripts/chrome-web-store/build.mjs` e empacotar de novo.

### Testes feitos

O zip foi extraído numa pasta nova e carregado num Chromium de teste (versão 145, perfil descartável, nada foi instalado no Chrome do Sandro):

- Extensão ativa, com zero erros de manifest, zero erros de execução e zero avisos de instalação na página de extensões do Chrome.
- Painel, página do microfone e documento de captura abrem sem erro de script.
- Os 4 ícones carregam nos tamanhos certos.
- No site `https://meet.2020agency.co` a extensão foi detectada (teste de 2026-11-25, com a versão 0.2.0).

Em 2026-11-26, com o zip 0.3.0 extraído numa pasta nova, 28 conferências do aviso passaram, no pacote da loja e na pasta de origem:

| O que foi conferido | Resultado |
|---------------------|-----------|
| Na primeira abertura aparece o aviso, e a tela inicial com o botão Iniciar fica escondida | Passou |
| Antes do aceite a extensão não faz nenhuma chamada de rede e não salva nada | Passou |
| "Agora não" fecha o painel sem registrar aceite. Abrir a política também não conta como aceite | Passou |
| O aceite fica salvo com versão e data, e só então o site é consultado | Passou |
| Sem aceite o service worker recusa a captura. Com aceite, libera | Passou |
| "Privacidade e autorização" mostra a data do aceite e permite voltar ou retirar | Passou |
| Depois de retirar, o aviso volta e a captura é recusada de novo | Passou |
| Aceite de uma versão antiga do aviso não vale: o aviso aparece de novo | Passou |
| Nenhum erro de script no painel, na página do microfone e no documento de captura | Passou |

**Não testado:** uma reunião real com captura de áudio usando o pacote da loja, e o clique no ícone abrindo o painel lateral. O Chromium de teste roda sem janela, sem conta e sem reunião. Esse teste está na lista do que falta (seção 8).

---

## 4. Ficha da loja (textos prontos)

| Campo | Valor |
|-------|-------|
| Nome | Meet Copilot |
| Resumo (vem do manifest, limite de 132 caracteres) | Copiloto de IA para reuniões no Google Meet: transcreve a conversa e sugere perguntas e respostas em tempo real. |
| Categoria | Workflow & Planning. Alternativa: Communication |
| Idioma | Português (Brasil) |
| Site (Homepage URL) | https://meet.2020agency.co |
| URL de suporte | A definir pelo Sandro (campo opcional) |
| Política de privacidade | https://meet.2020agency.co/privacidade (no ar desde 2026-11-26) |
| Ícone da loja | Já vai dentro do pacote (128 px) |
| Capturas de tela | `docs/loja-chrome/captura-1-painel.png`, `captura-3-aviso.png` e `captura-2-microfone.png`, nessa ordem (1280x800) |
| Imagens promocionais e vídeo | Opcionais. Não feitos |

O nome e o resumo saem do pacote. O restante é digitado no painel do desenvolvedor.

### Descrição detalhada

```text
O Meet Copilot acompanha a sua reunião no Google Meet e ajuda você a conduzir a conversa enquanto ela acontece.

COMO FUNCIONA
1. Entre na reunião do Google Meet e clique no ícone do Meet Copilot.
2. O painel abre ao lado da chamada. Na primeira vez, leia o aviso de privacidade e clique em "Concordo e quero continuar". Depois escolha a base de conhecimento e clique em "Iniciar copiloto nesta reunião".
3. A conversa é transcrita em blocos de cerca de 15 segundos. O painel mostra sugestões de perguntas e respostas com base no que está sendo dito e no contexto que você cadastrou.
4. Para compartilhar a tela, recolha o painel. O copiloto continua trabalhando e volta quando você clica no ícone.
5. Ao terminar, clique em "Encerrar".

O QUE VOCÊ PRECISA
- Uma conta no Meet Copilot: https://meet.2020agency.co
- Google Chrome no computador

O QUE A EXTENSÃO ACESSA E POR QUÊ
- Antes da primeira captura a extensão mostra um aviso e só continua se você concordar. Você pode retirar a autorização quando quiser, em "Privacidade e autorização".
- O áudio da aba da reunião e o seu microfone, somente depois que você clica em "Iniciar" e até você clicar em "Encerrar".
- O áudio é enviado por conexão segura ao servidor do Meet Copilot para ser transcrito. O servidor não guarda o áudio: o que fica salvo na sua conta é o texto da transcrição e as sugestões.
- O endereço da reunião e o contexto que você digita no painel, para registrar a reunião na sua conta.
- A extensão não lê o conteúdo das páginas que você visita.

SOBRE O AVISO DO CHROME
Ao instalar, o Chrome mostra o aviso "Ler e mudar seus dados em qualquer site". É o texto padrão do Chrome para extensões que capturam o áudio de uma aba. O Meet Copilot só captura o áudio da aba em que você clicou no ícone.

IMPORTANTE
Avise os participantes de que a conversa está sendo transcrita.

Política de privacidade: https://meet.2020agency.co/privacidade

Google Meet é uma marca da Google LLC. O Meet Copilot é um produto independente, sem vínculo com o Google.
```

---

## 5. Aba de privacidade (textos prontos)

O revisor do Google lê estes campos. Por isso cada um vem em português, para conferência, e em inglês, para colar.

### 5.1 Finalidade única

Português: assistente de reunião para o Google Meet. Quando o usuário clica em Iniciar, a extensão captura o áudio da reunião (a aba do Meet e o microfone), envia ao nosso servidor para transcrever e mostra sugestões de perguntas e respostas no painel lateral.

```text
Meet Copilot is a real-time meeting assistant for Google Meet. When the user clicks Start in the side panel, it captures the meeting audio (the Google Meet tab and the user's microphone), sends it to our server for transcription, and shows live suggested questions and answers in the side panel.
```

### 5.2 Justificativa de cada permissão

| Permissão | O que o código faz com ela | Onde |
|-----------|----------------------------|------|
| `activeTab` | O clique no ícone, na aba da reunião, é o que autoriza a captura do áudio daquela aba | `background.js` |
| `sidePanel` | Abre o painel lateral, que é toda a interface da extensão | `background.js`, `panel.html` |
| `tabCapture` | Captura o áudio da aba do Meet, com a voz dos outros participantes | `background.js`, `offscreen.js` |
| `offscreen` | Cria o documento invisível que grava o áudio da aba e do microfone e envia ao servidor | `background.js`, `offscreen.js` |
| `storage` | Guarda o aceite do aviso de privacidade (versão e data), a aba autorizada e a reunião em andamento, para o painel poder ser fechado e reaberto | `consent.js`, `background.js`, `panel.js` |

Textos para colar:

**activeTab**
```text
The user clicks the extension icon while on the Google Meet tab to open the side panel. That click is the user gesture that grants temporary access to that tab, which chrome.tabCapture.getMediaStreamId requires in order to capture the tab's audio. Nothing is captured without that click.
```

**sidePanel**
```text
The whole user interface lives in the Chrome side panel, next to the meeting: the start screen (choose a knowledge base, start and stop the copilot) and the live suggestions view. The panel is opened with chrome.sidePanel.open when the user clicks the extension icon.
```

**tabCapture**
```text
Core feature. Used to capture the audio of the Google Meet tab (the other participants' voices) so the conversation can be transcribed. Capture starts only after the user has accepted the in-product privacy notice, clicked the extension icon on the meeting tab and then clicked "Iniciar copiloto nesta reunião" (Start), and it stops when the user clicks "Encerrar" (End). Only audio is captured, never video or page content. The captured audio is also played back so the user keeps hearing the meeting.
```

**offscreen**
```text
Manifest V3 service workers cannot use getUserMedia or MediaRecorder. The extension creates one offscreen document (reason: USER_MEDIA) that records the tab audio stream and the user's microphone in 15-second segments and uploads the segments that contain speech over HTTPS for transcription. It keeps recording while the side panel is collapsed and is closed when the user clicks End.
```

**storage**
```text
chrome.storage.local holds the user's consent to the in-product privacy notice (notice version and date), so the notice is not shown again on every use and can be withdrawn, plus one optional configuration value (the address of our web app, used for testing). chrome.storage.session keeps the id of the tab the user authorized and the active meeting session (the panel URL and a short-lived session token), so the side panel can be closed and reopened during a meeting without losing it. No browsing data is stored.
```

### 5.3 Justificativa de cada site

| Site | O que o código faz | Onde |
|------|--------------------|------|
| `https://meet.google.com/*` | Reconhece que a aba ativa é uma reunião do Meet e lê o endereço dela para registrar a reunião. Não injeta nada na página do Meet | `panel.js` |
| `https://meet.2020agency.co/*` | É o site do produto. O painel chama a API com o login do usuário, mostra a tela de sugestões dentro do painel e um script avisa ao site que a extensão está instalada | `panel.js`, `detect.js` |
| `https://agencia2020-meet-copilot-engine.ocgogh.easypanel.host/*` | É o servidor de transcrição do produto. Recebe os trechos de áudio e o aviso de fim da reunião | `offscreen.js`, `panel.js` |

Textos para colar:

**https://meet.google.com/***
```text
Used only to recognize that the active tab is a Google Meet meeting and to read that tab's URL (the meeting link, without the query string), which is saved with the meeting record in the user's account. The extension does not inject scripts into Google Meet and does not read or change the page.
```

**https://meet.2020agency.co/***
```text
This is our own web app. The side panel calls its API using the user's signed-in session to list the user's knowledge bases and to create the meeting session, and it displays the live suggestions page from this site inside the panel. A content script on this site only sets one attribute that tells our web app the extension is installed, so the app can hide the installation instructions.
```

**https://agencia2020-meet-copilot-engine.ocgogh.easypanel.host/***
```text
This is our own transcription server. The offscreen document uploads the recorded audio segments to it over HTTPS, and the side panel notifies it when the user ends the meeting.
```

### 5.4 Código remoto

Resposta: **"No, I am not using remote code"**.

Todo o JavaScript está dentro do pacote. Não há `<script>` apontando para fora, nem `eval`. O painel mostra uma página do nosso site dentro de um quadro (iframe). Essa página não tem acesso às funções da extensão, e a regra da loja trata conteúdo isolado desse jeito como comunicação com servidor, não como código remoto.

### 5.5 Dados coletados

O que o código realmente envia para fora do computador do usuário:

| Dado | Quando | Para onde |
|------|--------|-----------|
| Áudio da aba do Meet e do microfone, em trechos de 15 segundos, só os que têm fala | Entre "Iniciar" e "Encerrar" | Servidor de transcrição do produto, por HTTPS |
| Endereço da reunião, sem os parâmetros | Ao clicar em "Iniciar" | Site do produto |
| Base de conhecimento e clone escolhidos, e o contexto digitado (até 4.000 caracteres) | Ao clicar em "Iniciar" | Site do produto |
| Sessão de login do usuário no site (cookie enviado pelo próprio Chrome) | Nas chamadas ao site do produto | Site do produto |

O que fica só no computador: o aceite do aviso (versão e data), a aba autorizada, a reunião em andamento com um código temporário de sessão (estes dois apagados ao fechar o Chrome) e um ajuste opcional de endereço.

Antes do aceite do aviso, nada disso é enviado: a extensão não faz nenhuma chamada de rede.

O que acontece no servidor: o áudio é transcrito por um serviço contratado e não é gravado em disco nem em banco. Ficam salvos o texto da transcrição e as sugestões. Serviços que recebem dados para o produto funcionar, segundo o código de hoje: Groq (transcrição do áudio), Anthropic (sugestões, relatório e proposta), Groq ou NVIDIA (classificação do que foi dito, conforme a configuração), Supabase (banco de dados), Vercel (site) e o servidor do EasyPanel (motor).

Caixas a marcar no formulário. Os nomes abaixo são os que eu conheço do painel; a documentação oficial não traz a lista, então confira na tela:

| Categoria | Marcar? | Motivo |
|-----------|---------|--------|
| Personally identifiable information | Sim | Os dados ficam ligados à conta do usuário, e a transcrição costuma citar nomes |
| Personal communications | Sim | Áudio e transcrição de reuniões |
| Website content | Sim | O som da aba do Meet |
| Authentication information | Não | A extensão não coleta senha. Usa o login que o usuário já fez no site |
| Web history | Não | Só lê o endereço da reunião em que o copiloto é iniciado |
| User activity, Location, Health information, Financial and payment information | Não | Não coleta |

As três declarações que o Sandro marca, com o que o código mostra hoje:

| Declaração | Verdadeira hoje? |
|------------|------------------|
| Não vendo nem transfiro dados a terceiros fora dos usos aprovados | Sim. Os serviços listados acima só processam os dados para o produto funcionar |
| Não uso nem transfiro dados para fins sem relação com a finalidade única | Sim |
| Não uso nem transfiro dados para avaliar crédito ou conceder empréstimo | Sim |

### 5.6 Política de privacidade

Campo obrigatório para o Meet Copilot, porque a extensão lida com dados do usuário.

Endereço a informar no painel: `https://meet.2020agency.co/privacidade`

A página foi escrita em 2026-11-26 (`apps/web/src/app/privacidade/page.tsx`), com a declaração de Uso Limitado e um resumo em inglês para o revisor. **Ela está no ar desde 2026-11-26**, publicada com o "Sim, publicar" do Sandro. Ele informou o nome do responsável e o e-mail de contato e aprovou o texto no mesmo dia; os três estão em `apps/web/src/lib/privacy.ts` (a aprovação, no campo `approvedOn`). Confira o endereço no navegador antes de enviar a ficha.

O que a política diz, em resumo, sempre conforme o código de hoje:

| Assunto | O que está escrito |
|---------|--------------------|
| Áudio | Não é guardado. É transcrito e descartado |
| O que fica guardado | Texto da conversa, sugestões, checagens, relatório e proposta, endereço da reunião e contexto digitado |
| Por quanto tempo | Enquanto a conta existir ou até o usuário pedir a exclusão. **Não promete 90 dias** (ver seção 8, item 5) |
| Com quem compartilha | Groq, Anthropic, NVIDIA, Supabase, Vercel e Google (login e fontes) |
| O que não faz | Não vende dados, não usa para publicidade nem para crédito, não treina IA com eles, não usa rastreamento |
| Leitura por pessoas | Ninguém da equipe lê transcrições, salvo com autorização do usuário, por segurança ou por exigência legal. É um compromisso que o Sandro assume ao aprovar o texto |
| Direitos | Os da LGPD, exercidos pelo e-mail de contato, com menção à ANPD |

### 5.7 Aviso e aceite dentro da extensão

Pronto desde a versão 0.3.0. Na primeira abertura o painel mostra, antes de qualquer envio, o que é capturado, para onde vai, o que fica salvo e para que serve, com os botões "Concordo e quero continuar" e "Agora não". O texto está em `apps/extension/panel.html` e a lógica em `apps/extension/consent.js`.

Se o revisor perguntar onde está o aviso:

```text
The prominent disclosure is shown inside the side panel the first time the user opens the extension, before any data is collected or any network request is made. It states what is captured (audio of the Google Meet tab and of the microphone, only between Start and End), where it goes (our server and a speech-to-text provider), what is stored (the transcript and the generated content, not the audio) and what it is used for. The user must click "Concordo e quero continuar" (I agree and want to continue) to proceed. Closing the panel or clicking "Agora não" (Not now) records nothing. The background service worker also refuses to start a capture when no consent is stored. The user can review the notice and withdraw consent at any time under "Privacidade e autorização" (Privacy and consent).
```

---

## 6. Instruções de teste para o revisor

O campo não é obrigatório, mas a extensão só funciona com login, então sem isso o revisor não consegue ver nada. Usuário e senha da conta de teste entram nos campos próprios do painel, digitados pelo Sandro. **Nunca escreva a senha neste arquivo.**

```text
Meet Copilot requires an account on our web app. Please use the test account provided in the credentials fields.

1. In the same Chrome profile, sign in at https://meet.2020agency.co/login with the test account.
2. Start a Google Meet call (for example https://meet.google.com/new) and join it.
3. With the Meet tab in front, click the Meet Copilot icon in the toolbar. The side panel opens.
4. First use only: the panel shows the privacy notice. Read it and click "Concordo e quero continuar" (I agree and want to continue).
5. Click "Iniciar copiloto nesta reunião" (Start copilot in this meeting).
6. First use only: a tab opens asking for microphone permission. Allow it, go back to the Meet tab and click Start again. If the panel asks you to authorize the tab, click the Meet Copilot icon once more and then Start.
7. Speak for about 30 seconds. The transcript and the live suggestions appear in the side panel in blocks of about 15 seconds.
8. Click "Encerrar" (End) to stop the capture.

The extension captures audio only between Start and End. The interface is in Brazilian Portuguese.
```

---

## 7. Requisitos da loja, conferidos na documentação oficial em 2026-11-25

| Requisito | O que a documentação diz | Situação |
|-----------|--------------------------|----------|
| Taxa de cadastro | Taxa única ("one-time registration fee"). A página atual não mostra o valor. O valor de 5 dólares vem do anúncio oficial de 2020 e aparece na hora de pagar | Cabe ao Sandro |
| Verificação em duas etapas | Obrigatória para toda conta de desenvolvedor antes de publicar | Cabe ao Sandro |
| E-mail de contato verificado e nome do publicador | Obrigatórios ao criar a conta | Cabe ao Sandro |
| Formato do pacote | Arquivo zip, até 2 GB | Cumprido (22 KB) |
| Manifest V3, sem código remoto | Proibido carregar script de fora do pacote e executar texto baixado | Cumprido |
| Ícone no pacote | 128x128 px em PNG é obrigatório. 48 px recomendado, 16 px opcional. No de 128, o desenho ocupa 96x96 com 16 px transparentes de cada lado | Cumprido |
| Capturas de tela | 1280x800 ou 640x400 px, de 1 a 5, sem margem e com cantos retos | Cumprido com 3. Falta uma do painel em uso (seção 8) |
| Imagens promocionais (440x280 e 1400x560) e vídeo | Opcionais | Não feitos. Pouco relevantes para item não listado |
| Nome e resumo | Nome com até 75 caracteres, resumo com até 132 | Cumprido (12 e 112) |
| Descrição | Não pode ficar em branco, nem repetir palavra-chave, nem enganar | Texto pronto na seção 4 |
| Marcas do Google | Não usar marca do Google como nome. Ao citar um produto do Google, dar o crédito da marca | Crédito incluído na descrição. Ver risco na seção 9 |
| Permissões mínimas | Pedir só o necessário. Pedir a mais pode causar recusa | Cumprido no pacote da loja (sem localhost e sem `tabs`) |
| Justificativa de permissões, finalidade única e código remoto | Campos da aba de privacidade | Textos prontos na seção 5 |
| Política de privacidade | Obrigatória para quem lida com dados do usuário. Link informado no painel. Precisa dizer o que coleta, como usa e com quem compartilha | **Cumprido.** No ar desde 2026-11-26, aprovada pelo Sandro |
| Declaração de Uso Limitado | Frase afirmando que o uso dos dados segue a regra de Uso Limitado, em uma página do site da extensão, com link a partir da página inicial | **Cumprido.** Está na política, em português e em inglês, e a página inicial tem o link. No ar desde 2026-11-26 |
| Aviso destacado e consentimento | Mostrar quais dados são coletados e para quê, e obter o aceite informado do usuário. Se a prática mudar depois da instalação, avisar de novo | **Cumprido no pacote 0.3.0.** O aviso aparece antes de qualquer envio, e a descrição da ficha repete o que é coletado |
| Transmissão segura | Dados do usuário só por conexão criptografada | Cumprido (tudo por HTTPS) |
| Regra própria para gravação de áudio ou de reunião | Não existe. Valem as regras gerais de dados acima | Sem ação |
| Instruções de teste | Opcionais. Úteis quando o produto exige login | Texto pronto na seção 6. Falta a conta de teste |
| Visibilidade | Público, Não listado ou Privado. Todos passam pela mesma análise | Escolher "Não listado" |
| Prazo da análise | Na maioria dos casos, alguns dias. Pode chegar a algumas semanas. Conta nova, extensão nova e permissão sensível aumentam o prazo | Contar com isso |
| Publicação adiada | Dá para aprovar na análise e publicar depois, em até 30 dias | Opcional |

---

## 8. O que ainda falta para poder enviar

Resolvido em 2026-11-26: a política de privacidade foi escrita, a declaração de Uso Limitado está nela, a página inicial ganhou o link e a extensão ganhou o aviso com aceite. No mesmo dia o Sandro aprovou o texto e o site foi publicado.

| # | Pendência | Quem resolve | Obrigatório? |
|---|-----------|--------------|--------------|
| 1 | **Dados para a política. Resolvido em 2026-11-26:** o Sandro informou o nome do responsável (Agência 2020) e o e-mail de contato, e os dois estão em `apps/web/src/lib/privacy.ts`. Com os dois preenchidos, o build de produção gerou `/privacidade` completa e com os links na página inicial, no login e no cadastro (conferido em 2026-11-26, antes de a trava de aprovação da pendência 2 entrar) | Feito | Feito |
| 2 | **Aprovar o texto da política. Resolvido em 2026-11-26:** o Sandro aprovou ("Aprovo") e a data está no campo `approvedOn` de `apps/web/src/lib/privacy.ts`. O texto faz promessas em nome do negócio: não vender dados, não usar para publicidade, ninguém da equipe ler transcrições sem autorização, atender pedidos de exclusão, avisar em caso de incidente. Se o texto mudar de forma relevante, pedir nova aprovação e atualizar as duas datas | Feito | Feito |
| 3 | **Publicar o site. Resolvido em 2026-11-26:** registros `d0b0892`, `e897b3b` e `cef024c` enviados ao `main` e site publicado na Vercel (`meet-copilot-2y1za6xyo`). Conferido no endereço público: `/privacidade` responde 200 com o nome, o e-mail e a declaração de Uso Limitado, e a página inicial, o login e o cadastro têm o link | Feito | Feito |
| 4 | **Teste de uma reunião real** com a pasta do pacote da loja: clicar no ícone, aceitar o aviso, iniciar, ver a transcrição chegar e encerrar. O teste automático não cobre o clique no ícone nem a captura de áudio | Sandro, com ajuda, ou uma sessão com o Chrome dele logado | Sim, antes de enviar |
| 5 | **Prazo de guarda dos dados (decisão).** Conferido em 2026-11-26: o banco tem os campos `workspaces.retention_days` (90) e `meetings.retention_until`, mas nenhuma rotina apaga nada. Por isso a política diz que os dados ficam até o usuário pedir a exclusão. Se o Sandro quiser apagar sozinho depois de um prazo, é preciso criar a rotina e mudar a política | Sandro decide. Não bloqueia o envio | Não |
| 6 | **Como atender um pedido de exclusão.** Hoje não há botão para apagar uma reunião nem para encerrar a conta: o pedido chega por e-mail e é atendido direto no banco. Bases, documentos, clones e chave de IA o usuário já apaga sozinho | Desenvolvimento, quando chegar o primeiro pedido ou antes | Não para o envio. Sim para cumprir o que a política promete |
| 7 | **Conta de teste** para o revisor | Sandro | Na prática, sim |
| 8 | **Captura de tela do painel em uso**, com sugestões aparecendo numa reunião de teste | Desenvolvimento, numa reunião de teste | Recomendado |
| 9 | **Zip manual.** Continua na versão 0.2.0, sem o aviso. Decidir se ele é refeito agora ou aposentado quando a loja aprovar | Sandro decide | Não |

Para conferir de novo a qualquer momento: abrir https://meet.2020agency.co/privacidade e ver o link "Política de privacidade" na página inicial.

Se um dia o robô da Recall.ai for ligado (o caminho existe no código, mas está inativo), a política precisa incluir a Recall.ai na lista de serviços.

---

## 9. Riscos na análise do Google

| Risco | Chance | O que fazer |
|-------|--------|-------------|
| Análise demorada. Conta nova, extensão nova e captura de áudio de aba entram em análise mais longa | Alta | Enviar com antecedência. Passando de três semanas, a documentação manda abrir chamado no suporte |
| Recusa por aviso ou política insuficientes | Baixa | O aviso com aceite está no pacote 0.3.0 e a política cobre o que a regra pede. Se o revisor questionar, o texto de resposta está na seção 5.7 |
| Link da política fora do ar no dia do envio | Baixa | A página está no ar desde 2026-11-26. Abrir o endereço no navegador antes de enviar a ficha, para conferir |
| Questionamento do nome, por lembrar o Google Meet | Baixa | A descrição já dá o crédito da marca e diz que não há vínculo. Se o Google reclamar, trocar o nome exibido na loja |
| Endereço do servidor de transcrição é um endereço técnico do EasyPanel | Baixa na análise, mas com efeito depois | Se o servidor mudar de endereço, é preciso nova versão e nova análise, e o Chrome desliga a extensão de cada usuário até ele aceitar a permissão nova. Um endereço próprio (por exemplo `engine.2020agency.co`) evita isso. O ideal é decidir antes do primeiro envio |

---

## 10. Próximo passo, depois que a extensão estiver na loja (não feito agora)

Com o link da loja em mãos:

1. **`apps/web/src/app/app/install/page.tsx`**: trocar os 5 passos manuais (baixar, descompactar, modo do desenvolvedor, carregar a pasta) por um botão "Instalar pelo Chrome" com o link da loja, seguido de três passos: fixar o ícone, aceitar o aviso de privacidade e permitir o microfone. Tirar a frase "a versão da Chrome Web Store vem em seguida". Explicar o aviso do Chrome (seção 2).
2. **`docs/tutoriais/guias.html`**: no guia de instalação, trocar os passos de baixar o zip, abrir `chrome://extensions`, ligar o "Modo do desenvolvedor" e "Carregar sem compactação" por: abrir o link, clicar em "Usar no Chrome" e em "Adicionar extensão". Incluir o passo novo do primeiro uso: ler o aviso e clicar em "Concordo e quero continuar". Ajustar a tabela de problemas e gerar os PDFs de novo.
3. **`docs/tutoriais/mensagem-whatsapp.txt`**: o passo 2 passa a ser o link da loja, e o tempo estimado cai de 10 minutos para 1.
4. **`apps/extension/README.md`**: atualizar a seção de distribuição.
5. **Igualar a fonte ao pacote da loja**: levar os ícones e a retirada de `tabs` para `apps/extension/manifest.json`, depois de testados, e decidir se o zip manual continua existindo.
6. **Avisar quem instalou pelo zip**: remover a versão manual antes de instalar a da loja, para não ficar com dois ícones. A versão da loja é outra instalação para o Chrome, então o microfone precisa ser permitido de novo.

A cada versão nova: subir o número em `apps/extension/manifest.json`, rodar `bun run package:store`, enviar o zip novo no painel e aguardar a análise. Quem instalou pela loja recebe a atualização sozinho.

Se a versão nova mudar o que é coletado, para onde vai ou para que serve: atualizar o aviso em `apps/extension/panel.html`, a página `/privacidade`, a data em `apps/web/src/lib/privacy.ts` e subir o `CONSENT_VERSION` em `apps/extension/consent.js`. Assim quem já aceitou vê o aviso de novo, como a regra da loja pede.

---

## Fontes consultadas em 2026-11-25

As páginas de Uso Limitado e de aviso e consentimento foram relidas em 2026-11-26, antes de escrever a política e o aviso.

- Cadastro e taxa: https://developer.chrome.com/docs/webstore/register
- Conta e e-mail de contato: https://developer.chrome.com/docs/webstore/set-up-account
- Verificação em duas etapas: https://developer.chrome.com/docs/webstore/program-policies/two-step-verification
- Envio e publicação adiada: https://developer.chrome.com/docs/webstore/publish
- Visibilidade: https://developer.chrome.com/docs/webstore/cws-dashboard-distribution
- Análise e prazos: https://developer.chrome.com/docs/webstore/review-process
- Instruções de teste: https://developer.chrome.com/docs/webstore/cws-dashboard-test-instructions
- Imagens: https://developer.chrome.com/docs/webstore/images
- Campos da ficha: https://developer.chrome.com/docs/webstore/cws-dashboard-listing
- Categorias: https://developer.chrome.com/docs/webstore/best_practices
- Regras da ficha: https://developer.chrome.com/docs/webstore/program-policies/listing-requirements
- Marcas do Google: https://developer.chrome.com/docs/webstore/branding
- Avisos de permissão: https://developer.chrome.com/docs/extensions/reference/permissions-list
- Aba de privacidade: https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- Política de privacidade: https://developer.chrome.com/docs/webstore/program-policies/privacy
- Uso Limitado: https://developer.chrome.com/docs/webstore/program-policies/limited-use
- Aviso e consentimento: https://developer.chrome.com/docs/webstore/program-policies/disclosure-requirements
- Perguntas e respostas sobre dados: https://developer.chrome.com/docs/webstore/program-policies/user-data-faq
- Permissões mínimas: https://developer.chrome.com/docs/webstore/program-policies/permissions
- Manifest V3 e código remoto: https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements
- Finalidade única: https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines
- Transmissão segura: https://developer.chrome.com/docs/webstore/program-policies/data-handling
- Valor da taxa (anúncio de 2020): https://blog.chromium.org/2020/03/new-developer-dashboard-and.html
