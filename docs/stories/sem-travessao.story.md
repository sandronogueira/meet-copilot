# Story: Sem travessão em texto nenhum do produto

**Status:** InReview (site, extensão, motor e banco publicados em 2026-11-24; falta ver a IA escrevendo sem travessão numa reunião real)
**Origem:** pedido direto do Sandro em 2026-11-24: "tira o [travessão] de tudo" / "vício de IA"
**Executor:** Fable 5.2

## Por quê

Travessão é marca registrada de texto escrito por IA. Num produto cuja promessa é o
vendedor parecer especialista sem o cliente perceber a IA, ele não pode aparecer nas
telas nem, principalmente, nas sugestões, relatórios e propostas que a IA escreve.

## Regra (vale daqui para frente)

Nenhum texto que alguém leia leva travessão nem meia-risca: telas, mensagens de erro,
extensão, proposta pública, prompts e saída da IA. No lugar: ponto, vírgula,
dois-pontos, ou o ponto médio em etiquetas (ex.: "ETAPA 1 DE 4 · PERFIL").
Comentários de código não entram na regra (ninguém de fora lê).

## Tarefas

- [x] Varredura de todos os textos fora de comentários (83 ocorrências)
- [x] Reescrita dos 82 textos fixos (web, extensão, shared, motor)
- [x] Zip da extensão refeito
- [x] Filtro determinístico + regra nos prompts para o que a IA gera
- [x] Migração 0011 para as perguntas de exemplo dos clones nativos
- [x] Publicar o site (Vercel)
- [x] Deploy do motor no EasyPanel (levou junto o roteador multi-provider `e04f94e`), autorizado pelo Sandro
- [x] Migração 0011 aplicada no banco de produção (SQL Editor do Supabase), autorizada pelo Sandro

## File List

**Novos**
- `services/meeting-engine/src/lib/sem-travessao.ts`: `REGRA_SEM_TRAVESSAO`, `semTravessao`, `semTravessaoEmTudo`
- `services/meeting-engine/src/lib/sem-travessao.test.ts`
- `supabase/migrations/0011_sem_travessao_seeds.sql`
- `docs/stories/sem-travessao.story.md`

**Alterados (só textos)**
- `apps/web/src`: 24 arquivos de telas, actions e APIs (cadastro, painel, registro, bases, clones, consumo, instalação, backoffice, proposta pública, painel da extensão, leitor de arquivo e de site)
- `apps/extension`: `panel.html`, `panel.js`, `mic-permission.html`, `offscreen.js`, `README.md`; `apps/web/public/downloads/meet-copilot-extension.zip` refeito
- `packages/shared/src/schemas/llm-config.ts`
- `services/meeting-engine/src`: `config.ts`, `index.ts`, `lib/llm-router.ts`, `session/SessionManager.ts`

**Alterados (lógica)**
- `services/meeting-engine/src/pipeline/CopilotPipeline.ts`: regra no prompt do gerador e filtro nas sugestões aceitas
- `services/meeting-engine/src/pipeline/Finalizer.ts`: regra nos prompts e filtro no relatório e na proposta
- `package.json` (raiz): `bun run test` passa a cobrir o motor; descrição sem travessão

## Decisões

| # | Decisão | Racional |
|---|---------|----------|
| D1 | Reescrever cada texto com a pontuação certa, em vez de trocar tudo por hífen | Hífen com espaços continua com cara de travessão; o texto fica natural |
| D2 | Duas camadas para o que a IA gera: regra no prompt **e** filtro na saída | Instrução de estilo o modelo às vezes ignora; o filtro garante |
| D3 | Filtro no motor (na origem), não na tela | O dado já é gravado limpo; vale para painel, registro e proposta pública de uma vez |
| D4 | Ficam de propósito: o mapa de entidades do leitor de site e o teste dele | O leitor precisa reconhecer travessões que vêm dos sites dos clientes |
| D5 | Migração nova (0011) em vez de editar a 0002 | A 0002 já foi aplicada em produção |

## Verificação (2026-11-24)

1. Varredura (`[travessão ou meia-risca]` fora de comentários em web, extensão, shared e motor): de 83 para 3, e os 3 são os casos da D4.
2. `bun run typecheck` PASS · `bun run test` **25 pass, 0 fail** (7 testes novos do filtro) · `NODE_ENV=production next build` PASS.
3. Site publicado: commit `91a4e2f`, deploy `meet-copilot-41dx6t8hv-…`, apelidado para `meet.2020agency.co`. Com a sessão do Sandro (somente leitura), `/onboarding` mostra "ETAPA 1 DE 4 · PERFIL", "Quem está na reunião e como você vende?" e **zero** travessões na página inteira. O zip baixado de produção já traz os textos novos.

4. Motor novo testado localmente com a IA real antes de publicar (commit `739320f`, config padrão: Anthropic + Sonnet): relatório em 7,7s, proposta com as 7 seções em 15,5s, 2 sugestões ao vivo em 4,9s. **Zero travessões** nos três. Custo: três chamadas de IA.
5. Motor publicado no EasyPanel: o histórico mostra o deploy do commit "feat(engine): IA não escreve travessão…" no topo; `/health` voltou com tempo no ar de 62s (antes 3.720s), `supabase: true`, `copilot: true`. Fumaça em produção sem custo: `/experts` devolve os 8 clones com token e 403 sem; `/report` e `/proposal` de uma reunião inexistente respondem 400 `EMPTY`.
6. Banco: consulta antes mostrou 2 clones com travessão nas perguntas de exemplo ("O Desafiador" e "A Estrategista") e nenhum travessão em tagline, bio ou style_prompt dos 8 clones. Depois da 0011: os dois sem travessão, nenhuma linha restante.

**Não verificado:** um relatório ou proposta gerado em produção a partir de uma reunião real (o banco novo ainda não tem reunião com transcrição). O caminho foi exercitado só até a checagem de transcrição vazia.

## Observações

- **Roteador multi-provider (`e04f94e`) agora está em produção.** Foi junto no Deploy. Com a configuração padrão ele se comportou como antes no teste local; configurações por workspace (Groq, NVIDIA, advisor) continuam sem uso real.
- **Extensão já instalada:** só troca os textos se for reinstalada a partir do zip novo (o funcionamento é idêntico).
- **Voltar atrás, se preciso:** o EasyPanel publica o que está no `main`; reverter o motor exige reverter os commits no GitHub e dar Deploy de novo.
