# Story: Extensão na Chrome Web Store (item não listado)

**Status:** Preparado em 2026-11-25. Nada enviado à loja, nada commitado. Faltam pendências antes do envio (ver "O que falta").
**Origem:** pedido do Sandro em 2026-11-25: "um arquivo para eu enviar pelo WhatsApp para que a pessoa possa clicar e já instalar a extensão automaticamente". O Chrome não instala extensão por arquivo fora da loja, então o caminho é publicar como não listada e enviar o link.
**Executor:** Fable 5.2
**Documento principal:** `docs/LOJA-CHROME.md` (ficha, justificativas, requisitos, pendências e a lista do que cabe ao Sandro)

## Por quê

Os primeiros usuários externos são os vendedores da CapBox, que não são técnicos. Hoje a instalação pede
baixar um zip, abrir `chrome://extensions`, ligar o "Modo do desenvolvedor" e carregar uma pasta. É o maior
atrito do produto para esse público. Pela loja, a instalação vira um clique num link.

## Critérios de aceite

- [x] Existe um zip pronto para a loja, gerado de `apps/extension`, sem as permissões de desenvolvimento e com os ícones exigidos
- [x] O zip carrega sem erro no Chrome a partir de uma pasta extraída dele
- [x] A extensão em uso pelo zip manual não muda
- [x] Existe um arquivo em `docs/` com os textos da ficha, a justificativa de cada permissão e a declaração de uso de dados, coerentes com o código
- [x] Os requisitos vigentes da loja foram conferidos na documentação oficial e os não cumpridos estão listados
- [x] O Sandro tem a lista do que só ele pode fazer
- [x] O próximo passo (página de instalação e guias) está descrito, sem ser feito

## Decisões

| # | Decisão | Racional |
|---|---------|----------|
| D1 | O manifest da loja é **gerado no empacotamento** (`scripts/chrome-web-store/build.mjs`). `apps/extension` não foi tocado | O zip manual está em uso e não pode mudar de comportamento |
| D2 | O pacote da loja **não pede `tabs`** | A loja exige pedir o mínimo e pode recusar quem pede a mais. O único uso é ler o endereço da aba ativa, e a permissão do site `meet.google.com` já entrega isso. Testado: sem `tabs` a extensão vê o endereço da aba do Meet e deixa de ver endereço e título das outras abas. O aviso de instalação é o mesmo. Reversível numa linha (`STORE_DROPPED_PERMISSIONS`) |
| D3 | Descrição curta **trocada só no pacote da loja** | A da fonte é um slogan. A loja recusa ficha que não descreve o produto |
| D4 | Ícones seguem `apps/web/src/app/icon.svg` (círculo ciano com a câmera), em 16, 32, 48 e 128 px. No de 128, o desenho ocupa 96 px com 16 px transparentes por lado | É a identidade real do produto e a regra de desenho da loja |
| D5 | Ícones renderizados no Chromium, não no ImageMagick | O ImageMagick desta máquina apagou os contornos escuros do desenho |
| D6 | Justificativas e instruções de teste em **inglês para colar**, com o resumo em português | Quem lê esses campos é o revisor do Google. A ficha voltada ao usuário fica em português |
| D7 | Pacote em `dist/chrome-web-store/`, fora do git | É saída de build, refeita por `bun run package:store`. Não vai para `public/`, para não ser servida pelo site |
| D8 | Duas capturas de tela feitas das telas reais da extensão, com dados de exemplo | A loja exige pelo menos uma. A do painel em uso numa reunião fica como pendência |

## Tarefas

- [x] Ler `background.js`, `offscreen.js`, `panel.js`, `detect.js` e as rotas que a extensão chama
- [x] Conferir os requisitos na documentação oficial da loja
- [x] Ícones 16, 32, 48 e 128 px
- [x] Script de empacotamento com conferências embutidas (limites de texto, ícones, arquivos citados, sem localhost, sem travessão)
- [x] Gerar o zip e testar a carga num Chromium de teste
- [x] Capturas de tela 1280x800
- [x] `docs/LOJA-CHROME.md`
- [x] Página de política de privacidade e declaração de Uso Limitado no site: escritas em 2026-11-26, ainda não publicadas (`docs/stories/loja-chrome-privacidade.story.md`)
- [x] Aviso e aceite dentro da extensão antes da primeira captura: pronto na versão 0.3.0 (mesma story)
- [ ] Teste de uma reunião real com o pacote da loja
- [ ] Conta de desenvolvedor, taxa, envio e análise (Sandro)
- [ ] Depois de aprovado: trocar a página de instalação, os guias e a mensagem do WhatsApp pelo link da loja

## File List

**Novos**
- `scripts/chrome-web-store/build.mjs`: gera o manifest da loja, confere e empacota
- `scripts/chrome-web-store/icons/icon-16.png`, `icon-32.png`, `icon-48.png`, `icon-128.png`
- `docs/LOJA-CHROME.md`
- `docs/loja-chrome/captura-1-painel.png`, `docs/loja-chrome/captura-2-microfone.png`
- `docs/stories/loja-chrome.story.md`

**Alterados**
- `package.json` (raiz): atalho `package:store`

**Gerados, fora do git**
- `dist/chrome-web-store/meet-copilot-loja-0.2.0.zip` e a pasta `dist/chrome-web-store/meet-copilot-loja-0.2.0/`

**Não tocados**
- `apps/extension/` e `apps/web/public/downloads/meet-copilot-extension.zip`

## Verificação (2026-11-25)

1. `bun run package:store` gera o zip (22 KB, 13 arquivos, `manifest.json` na raiz) e passa nas conferências embutidas.
2. Os 8 arquivos de código do pacote são idênticos aos de `apps/extension` (`cmp`). `git status` não mostra mudança em `apps/extension` nem no zip manual.
3. Zip extraído numa pasta nova e carregado no Chromium 145 de teste, com perfil descartável: extensão ativa, zero erros de manifest, zero erros de execução, zero avisos de instalação. Painel, página do microfone e documento de captura abrem sem erro de script. Ícones carregam nos 4 tamanhos. No site `https://meet.2020agency.co`, o script de detecção marcou a versão 0.2.0.
4. Aviso de instalação lido no Chromium em português: "Ler e mudar seus dados em qualquer site". Vem da captura de áudio de aba e é igual com ou sem `tabs`.
5. Comparação com e sem `tabs`, com uma aba de endereço do Meet (página simulada, sem rede) e uma de outro site: nas duas versões a extensão lê o endereço da aba do Meet. Só a versão com `tabs` lê endereço e título da outra aba.

**Não verificado:** captura de áudio numa reunião real com o pacote da loja (o Chromium de teste não tem conta nem
reunião), o clique no ícone abrindo o painel lateral (o teste rodou sem janela) e a aceitação do pacote pelo painel
do desenvolvedor da loja, que só acontece no envio.

## O que falta

Detalhes em `docs/LOJA-CHROME.md`, seção 8. Em resumo, antes de enviar:

1. Página de política de privacidade no site, com a declaração de Uso Limitado e link na página inicial.
2. Aviso e aceite dentro da extensão antes da primeira captura. Muda `apps/extension`, então pede story própria.
3. Teste de uma reunião real com a pasta do pacote da loja.
4. Conta de teste para o revisor e e-mail de suporte (Sandro).
5. Conferir se os dados são mesmo apagados em 90 dias, para a política dizer a verdade.

## Limitações conhecidas

- O valor da taxa (5 dólares) não está na página oficial atual, que diz só "taxa única". Vem do anúncio oficial de 2020.
- A lista de caixas de dados do formulário de privacidade não está na documentação. Os nomes em `docs/LOJA-CHROME.md` são os conhecidos do painel e precisam ser conferidos na tela.
- O servidor de transcrição usa um endereço técnico do EasyPanel. Se mudar, é preciso nova versão, nova análise e novo aceite de cada usuário.
- O ícone de 16 px fica pouco nítido por ser o desenho completo reduzido. Em telas de alta resolução o Chrome usa o de 32 px.
