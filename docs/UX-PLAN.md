# Meet Copilot — Planejamento UI/UX v1

> Escopo deste documento: **auth multi-login com perfis**, **onboarding que ensina a IA sobre a empresa do cliente** e a camada de **Especialistas (clones comerciais)** — do MVP com arquétipos internos até celebridades clonadas licenciadas.
> Direção visual: 2020agency.co (dark-first, acento turquesa). Tokens definitivos: consultar swipe file + `/frontend-design` antes de codar telas.

---

## 1. Personas de usuário (quem usa a ferramenta)

| Persona | Contexto | O que precisa |
|---|---|---|
| **Vendedor/Closer solo** | Faz 5–15 reuniões/semana | Entrar rápido, bot no calendário, sugestões que não atrapalhem |
| **Dono de agência/consultor** | Vende serviço complexo, manda proposta depois | Proposta pronta na hora, base de contexto rica, white-label |
| **Gestor comercial (plano Agência)** | Time de 3–20 SDRs/closers | Multi-seat, ver reuniões do time, padronizar abordagem via Especialista |

## 2. Arquitetura de informação (mapa de navegação)

```
PÚBLICO                          AUTENTICADO (/app)
├─ / (landing)                   ├─ /app ................. Dashboard (próximas reuniões + recentes)
├─ /login                        ├─ /app/meetings/[id] ... WAR ROOM (ao vivo)
├─ /signup                       ├─ /app/meetings/[id]/report
├─ /convite/[token]              ├─ /app/context ......... Base de Contexto (docs, site, preços)
└─ /p/[slug] (proposta pública)  ├─ /app/experts ......... Galeria de Especialistas (clones)
                                 ├─ /app/proposals (+ /[id]/edit — editor por seção)
   /onboarding (wizard,          ├─ /app/templates ....... Templates de proposta
    fora do shell /app)          └─ /app/settings
                                     ├─ perfil · workspace · membros & papéis
                                     ├─ billing · segurança (MFA, sessões)
                                     └─ privacidade (retenção, export, exclusão)
```

Regra de redirecionamento: login → `onboarding_completed_at` nulo? → `/onboarding` : `/app`.

## 3. Auth multi-login com perfil

**Fluxos:**
- **Signup** (e-mail+senha ou Google 1-clique) → cria `workspace` pessoal + `profile` → wizard de onboarding.
- **Convite de membro** (`/convite/[token]`): admin convida por e-mail em Settings→Membros; convidado cai direto no workspace com papel `member` (pula onboarding de empresa — ela já existe; faz só o mini-onboarding pessoal: nome, foto, "seu papel nas reuniões" p/ `selfLabel` da diarização).
- **Multi-workspace:** switcher no canto superior esquerdo (padrão Slack/Linear) — agência que atende N clientes cria 1 workspace por cliente.
- **Papéis** (já no schema): `owner` (billing+tudo), `admin` (membros, templates, base), `member` (reuniões próprias, propostas draft).

**Segurança visível na UI:** MFA/TOTP em Settings→Segurança, lista de sessões ativas com "revogar", aviso de gravação sempre visível no war room (pilar de marca "copiloto transparente").

## 4. Onboarding — "ensinar a IA em 5 minutos" ⭐

Wizard full-screen (fora do shell), 5 passos, barra de progresso, dark com acento turquesa. **Princípio: cada resposta vira conhecimento estruturado** — nada é pergunta decorativa. Tudo persiste incrementalmente (abandonou no passo 3? volta no passo 3).

```
┌──────────────────────────────────────────────────────────────┐
│  ● ● ● ○ ○   Passo 3 de 5                          [Sair]    │
│                                                              │
│   Como você vende?                                           │
│   A IA vai adaptar as sugestões à SUA abordagem.             │
│                                                              │
│   Metodologia que mais se parece com você:                   │
│   [ Consultiva ] [ SPIN ] [ Challenger ] [ Direto ao ponto ] │
│                                                              │
│   Objeções que você mais escuta: (chips + livre)             │
│   [ "tá caro" ×] [ "vou pensar" ×] [ + adicionar ]           │
│                                                              │
│   Seu cliente ideal (ICP):                                   │
│   [ex.: clínicas de estética com 2+ unidades faturando…]     │
│                                                              │
│                            [ Voltar ]  [ Continuar → ]      │
└──────────────────────────────────────────────────────────────┘
```

| Passo | Pergunta central | Vira o quê no sistema |
|---|---|---|
| **1. Você** | Nome, foto, "como você aparece nas reuniões" | `profiles` + `selfLabel` (supressão de triggers) |
| **2. Sua empresa** | **URL do site** (importação automática → crawler → chunks) + textarea guiada *"Descreva sua empresa como descreveria a um cliente"* + segmento | `documents(source_type='url')` + `documents(source_type='onboarding_profile')` na Base de Contexto |
| **3. O que você vende** | Produtos/serviços (chips + descrição), ticket médio, faixa de preços (manual ou upload de tabela) | `documents(source_type='pricing_table')` → semente do `default_packages` do template de proposta |
| **4. Como você vende** | Metodologia, tom (formal↔próximo), objeções comuns, ICP | `workspaces.settings.sales_profile` (JSON) — entra no prefixo cacheado do gerador |
| **5. Seu Especialista** | Galeria de clones — escolhe o estilo que vai "soprar no seu ouvido" | `workspaces.settings.default_expert_id` |

**Microcopy de fechamento (passo 5):** *"Pronto. Na sua próxima reunião, cole o link e entre. O resto é com a gente."* + campo "colar link da reunião" (teste-drive imediato = ativação).

**UX crítica:** o passo 2 mostra em tempo real o que a IA entendeu — enquanto o crawler processa o site, um painel lateral vai listando *"✓ Encontrei: 8 serviços · 3 cases · missão da empresa"*. Isso constrói confiança de que a base foi absorvida (e é o momento "uau" do onboarding).

## 5. Especialistas — clones comerciais (a personalidade do copiloto) ⭐

### Conceito de produto
O Especialista define **como** o copiloto pensa: estilo das perguntas, forma de validar, vocabulário, agressividade de fechamento. A Base de Contexto define **o quê** (empresa, preços, cases); o Especialista define **o como**.

### Fases
1. **MVP (F3):** 4 arquétipos internos, sem rosto de celebridade — validam a mecânica:
   - **O Consultivo** — perguntas de descoberta profunda, SPIN, zero pressão
   - **O Desafiador** — reframa o problema do cliente, provoca (Challenger)
   - **O Closer** — orientado a próximo passo e fechamento, detector de sinais de compra
   - **A Estrategista** — visão de negócio, ROI, fala com decisores C-level
2. **Fase 2:** especialistas com nome próprio criados pelo **squad-mind-clone-factory / oalanicolas** (Voice DNA + Thinking DNA extraídos de livros, palestras e frameworks públicos de grandes nomes de vendas).
3. **Fase 3 (celebridades licenciadas):** rosto + nome oficial mediante **contrato de licenciamento** (direito de imagem — art. 20 CC + LGPD; nunca clonar sem autorização; validar com legal-chief). Modelo de receita: revenue share com a celebridade = moat de marketing.

### Modelagem (migration futura `0002_experts.sql`)
```sql
sales_experts (
  id, scope text check (scope in ('global','workspace')),  -- catálogo oficial vs custom
  workspace_id uuid null,          -- quando scope='workspace'
  name, slug unique, avatar_url, tagline, bio,
  style_prompt text,               -- Voice DNA: como pergunta, valida, fecha
  question_frameworks jsonb,       -- ex.: {spin:[...], challenger:[...]}
  sample_questions jsonb,          -- preview na galeria
  is_licensed bool, licensing jsonb, -- contrato/royalties (fase 3)
  status text check (status in ('draft','active','retired'))
)
-- meetings.settings.expert_id → engine injeta style_prompt no gerador
```
**Injeção no pipeline:** o `style_prompt` entra no prefixo **cacheado** do gerador Sonnet (junto com o sales_profile), entre o system e o RAG — custo marginal ~zero, personalidade consistente a reunião inteira.

### UI da galeria (`/app/experts`)
Cards dark com avatar grande, tagline, "estilo de pergunta" e um **preview vivo**: hover/tap mostra 2 perguntas-exemplo aplicadas AO SEU segmento (usa o sales_profile — ex.: para clínica de estética, O Desafiador pergunta *"Quantas avaliações viram pacote hoje — e por que não o dobro?"*). Selo "Em breve" para a prateleira de celebridades (gera desejo + lista de espera = validação de demanda antes de licenciar).

### No war room
- Header: avatar mini do Especialista ativo + nome ("Copiloto: O Closer")
- Cada card de sugestão carrega o selo do Especialista
- Troca de Especialista: no pré-reunião sempre; mid-meeting não no MVP (quebra o cache do prompt e a consistência)

## 6. War room — anatomia da tela ao vivo

```
┌────────────────────────────────────────────────────────────────────┐
│ ● REC  Reunião com Clínica Vida | 00:23:14   [🤖 O Closer]  [⚙]  │
├───────────────────────────────┬────────────────────────────────────┤
│ TRANSCRIÇÃO (scroll ao vivo)  │  COPILOTO                          │
│                               │  ┌──────────────────────────────┐  │
│ Dr. Marcos: ...hoje a gente   │  │ 💬 PERGUNTA · O Closer       │  │
│ perde muito lead no WhatsApp  │  │ "Quanto custa um lead        │  │
│                               │  │  perdido pra vocês hoje?"    │  │
│ Você: entendi, e o time...    │  │        [Usei ✓] [Dispensar]  │  │
│                               │  ├──────────────────────────────┤  │
│ Dr. Marcos: o mercado de      │  │ 🔎 FACT-CHECK                │  │
│ estética cresce 40% ao ano    │  │ "mercado cresce 40% a.a."    │  │
│                               │  │ ⚠ Parcialmente confirmado    │  │
│                               │  │ Fontes divergem: 20–31% ▸    │  │
│                               │  └──────────────────────────────┘  │
├───────────────────────────────┴────────────────────────────────────┤
│ [ ⚡ Me ajuda agora ]                    [ 📄 Gerar Proposta ]      │
└────────────────────────────────────────────────────────────────────┘
```

Regras de UX: máx. **2 cards novos por minuto** (atenção é o recurso escasso); cards novos entram com glow turquesa 2s e sem som; feedback Usei/Dispensar alimenta `suggestions.status` (métrica de qualidade F3). Desktop-first (a pessoa está em call); relatório e proposta são mobile-ok.

## 7. Impacto no roadmap

| Marco | Conteúdo | Encaixe |
|---|---|---|
| **F0.5 — Auth + Onboarding shell** (novo) | Telas login/signup/convite, wizard 5 passos persistindo em `settings` + documents `pending` | Depois do F0-auth; importação do site só "liga" quando F2 (ingestão) existir — o wizard já grava a URL |
| **F2** | Pipeline de ingestão ativa a mágica do passo 2 | — |
| **F3** | 4 arquétipos internos + `expert_id` no gerador + galeria v1 | style_prompt no prefixo cacheado |
| **Pós-MVP** | Clones nomeados (mind-clone-factory) → celebridades licenciadas | Contrato de imagem + legal-chief antes de qualquer rosto real |

**Riscos específicos desta camada:** (1) onboarding longo mata ativação — 5 min máx, tudo pulável exceto passo 2; (2) clone de celebridade sem licença = risco jurídico alto (direito de imagem + LGPD) — arquétipos internos até contrato assinado; (3) persona exagerada vira caricatura — `style_prompt` sempre subordinado ao guardrail "sugestão útil > performance teatral".
