# Meet Copilot: Extensão Chrome (MV3)

Side panel estilo Claude Extension: captura o áudio da aba do Meet (participantes)
+ microfone (você) e envia em ciclos de ~15s para o meeting-engine, que transcreve
via Groq Whisper (grátis) e alimenta o war room carregado no próprio painel.

## Instalar (modo dev)

1. Chrome → `chrome://extensions` → ativar **Modo do desenvolvedor**
2. **Carregar sem compactação** → selecionar esta pasta (`apps/extension`)
3. Fixar o ícone; estar logado em https://meet.2020agency.co no mesmo Chrome

## Usar

1. Entre numa reunião do Google Meet
2. Clique no ícone da extensão (abre o side panel)
3. Na 1ª vez o painel mostra o aviso de privacidade: **Concordo e quero continuar**
4. **Iniciar copiloto nesta reunião** → autoriza o microfone na 1ª vez
5. O war room carrega no painel; transcrição chega em blocos de ~15s

## Aviso de privacidade e autorização

A Chrome Web Store exige mostrar o que é coletado e obter o aceite antes de coletar.

- O texto do aviso está em `panel.html` (`#consent`); a lógica, em `consent.js` e `panel.js`.
- A autorização fica em `chrome.storage.local`, chave `consent`: `{ version, acceptedAt }`.
- Sem autorização o painel não faz chamada de rede e o `background.js` recusa a captura
  (`code: 'CONSENT_REQUIRED'`).
- "Privacidade e autorização", na tela inicial, mostra o aviso de novo e permite retirar a autorização.
- **Mudou o que é coletado, para onde vai ou para que serve?** Atualize o aviso, a página
  `/privacidade` do site e suba o `CONSENT_VERSION` em `consent.js`. Quem já aceitou vê o aviso de novo.

## Dev apontando para localhost

No console do side panel:
`chrome.storage.local.set({ appOrigin: 'http://localhost:3000' })`

## Requisitos do backend

- `GROQ_API_KEY` no meeting-engine (senão `/ingest` responde 503)
- `ENGINE_WS_URL/SECRET` na Vercel (o `/api/extension/start` deriva a URL de ingest)

## Distribuição para testers (zip estático, D7)

Enquanto não existe conta developer na Chrome Web Store, a extensão é distribuída
como zip estático em `apps/web/public/downloads/meet-copilot-extension.zip`, baixado
pela página `/app/install`. **Regenerar o zip a cada mudança nesta pasta:**

```bash
cd apps/extension
zip -r ../web/public/downloads/meet-copilot-extension.zip . -x '.*' -x '__MACOSX*' -x '*.DS_Store'
```

O zip é commitado, não é gerado em build/deploy.
