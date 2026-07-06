# Meet Copilot — Extensão Chrome (MV3)

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
3. **Iniciar copiloto nesta reunião** → autoriza o microfone na 1ª vez
4. O war room carrega no painel; transcrição chega em blocos de ~15s

## Dev apontando para localhost

No console do side panel:
`chrome.storage.local.set({ appOrigin: 'http://localhost:3000' })`

## Requisitos do backend

- `GROQ_API_KEY` no meeting-engine (senão `/ingest` responde 503)
- `ENGINE_WS_URL/SECRET` na Vercel (o `/api/extension/start` deriva a URL de ingest)
