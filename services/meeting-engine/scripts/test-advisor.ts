// Smoke test do llm-router (services/meeting-engine/src/lib/llm-router.ts).
// Roda 3 cenários (anthropic / groq / nvidia), todos em phase: 'pre_call' (única fase
// em que o advisor é permitido — na fase 'live' o router bloqueia advisorEnabled por design).
// Uso: bun run scripts/test-advisor.ts  (a partir de services/meeting-engine/)
// Bun carrega services/meeting-engine/.env automaticamente.

import { runLLM, estimateCents } from '../src/lib/llm-router'
import type { CopilotLlmConfig, LlmMessage } from '@meet-copilot/shared'

const PLACEHOLDER_ID = '00000000-0000-0000-0000-000000000000'

const SYSTEM_PROMPT =
  'Você é um estrategista de vendas sênior. Analise e decida com rigor; quando a decisão for ' +
  'genuinamente difícil e você estiver incerto, use a ferramenta advisor/consult_advisor antes de se comprometer.'

const USER_PROMPT =
  'Transcript resumido de uma call de vendas: [prospect diz que orçamento é apertado, mas o problema é ' +
  'urgente; decisor secundário cético; prazo de decisão em 2 semanas]. Você precisa decidir entre 3 estratégias ' +
  'CONFLITANTES de proposta: (A) desconto agressivo com escopo reduzido; (B) preço cheio com prova de ROI e ' +
  'piloto pago; (C) parcelamento estendido mantendo escopo. As três têm trade-offs sérios e a escolha errada ' +
  'perde o negócio. Decida qual seguir e justifique em 3 frases.'

const MESSAGES: LlmMessage[] = [{ role: 'user', content: USER_PROMPT }]

const apiKeys = {
  anthropic: process.env.ANTHROPIC_API_KEY,
  groq: process.env.GROQ_API_KEY,
  nvidia: process.env.NVIDIA_API_KEY,
}

interface Scenario {
  name: string
  requiredKey: 'anthropic' | 'groq' | 'nvidia'
  config: CopilotLlmConfig
}

const SCENARIOS: Scenario[] = [
  {
    name: '(a) anthropic',
    requiredKey: 'anthropic',
    config: {
      id: PLACEHOLDER_ID,
      workspaceId: PLACEHOLDER_ID,
      phase: 'pre_call',
      provider: 'anthropic',
      executorModel: 'claude-sonnet-4-6',
      advisorEnabled: true,
      advisorModel: 'claude-fable-5',
      advisorMaxUses: 1,
      advisorMaxTokens: 2048,
    },
  },
  {
    name: '(b) groq',
    requiredKey: 'groq',
    config: {
      id: PLACEHOLDER_ID,
      workspaceId: PLACEHOLDER_ID,
      phase: 'pre_call',
      provider: 'groq',
      executorModel: 'llama-3.3-70b-versatile',
      advisorEnabled: true,
      advisorModel: 'claude-fable-5',
      advisorMaxUses: 1,
      advisorMaxTokens: 2048,
    },
  },
  {
    name: '(c) nvidia',
    requiredKey: 'nvidia',
    config: {
      id: PLACEHOLDER_ID,
      workspaceId: PLACEHOLDER_ID,
      phase: 'pre_call',
      provider: 'nvidia',
      executorModel: 'meta/llama-3.1-70b-instruct',
      advisorEnabled: true,
      advisorModel: 'claude-fable-5',
      advisorMaxUses: 1,
      advisorMaxTokens: 2048,
    },
  },
  {
    // Cenário de fallback: exercita o executor Groq (Caminho B) SEM advisor,
    // rodando apenas com GROQ_API_KEY — prova a chamada OpenAI-compat real
    // (conversão de mensagens, parsing de usage, estimateCents) mesmo quando
    // ANTHROPIC_API_KEY não está no .env local.
    name: '(d) groq s/advisor',
    requiredKey: 'groq',
    config: {
      id: PLACEHOLDER_ID,
      workspaceId: PLACEHOLDER_ID,
      phase: 'pre_call',
      provider: 'groq',
      executorModel: 'llama-3.3-70b-versatile',
      advisorEnabled: false,
      advisorModel: 'claude-fable-5',
      advisorMaxUses: 0,
      advisorMaxTokens: 2048,
    },
  },
  {
    // Executor NVIDIA (Caminho B) SEM advisor — roda só com NVIDIA_API_KEY,
    // prova a chamada OpenAI-compat da NVIDIA sem depender da ANTHROPIC_API_KEY.
    name: '(e) nvidia s/advisor',
    requiredKey: 'nvidia',
    config: {
      id: PLACEHOLDER_ID,
      workspaceId: PLACEHOLDER_ID,
      phase: 'pre_call',
      provider: 'nvidia',
      executorModel: 'meta/llama-3.1-70b-instruct',
      advisorEnabled: false,
      advisorModel: 'claude-fable-5',
      advisorMaxUses: 0,
      advisorMaxTokens: 2048,
    },
  },
]

interface SummaryRow {
  scenario: string
  status: 'ok' | 'error' | 'skipped'
  advisorCalled?: boolean
  executorTokens?: string
  advisorTokens?: string
  costCents?: string
  latencyMs?: string
}

const summary: SummaryRow[] = []

function fmtUsageLine(u: { role: string; model: string; tokensIn: number; tokensOut: number }): string {
  return `    - ${u.role}: model=${u.model} tokensIn=${u.tokensIn} tokensOut=${u.tokensOut}`
}

async function runScenario(scenario: Scenario): Promise<void> {
  console.log(`\n=== Cenário ${scenario.name} — provider=${scenario.config.provider} executor=${scenario.config.executorModel} ===`)

  // Advisor sempre é consultado via Anthropic, então ANTHROPIC_API_KEY só é
  // obrigatória quando o advisor está habilitado neste cenário.
  const missingKeys: string[] = []
  if (!apiKeys[scenario.requiredKey]) missingKeys.push(`${scenario.requiredKey.toUpperCase()}_API_KEY`)
  if (scenario.config.advisorEnabled && scenario.requiredKey !== 'anthropic' && !apiKeys.anthropic) {
    missingKeys.push('ANTHROPIC_API_KEY')
  }

  if (missingKeys.length > 0) {
    const msg = `⏭️  Cenário ${scenario.name} PULADO — ${missingKeys.join(', ')} ausente`
    console.log(msg)
    summary.push({ scenario: scenario.name, status: 'skipped' })
    return
  }

  try {
    const t0 = Date.now()
    const res = await runLLM({
      config: scenario.config,
      system: SYSTEM_PROMPT,
      messages: MESSAGES,
      apiKeys,
    })
    const latencyMs = Date.now() - t0

    if (!res.ok) {
      console.log(`ERRO — code=${res.error.code} message=${res.error.message}`)
      if (res.error.details) console.log(`  details: ${JSON.stringify(res.error.details).slice(0, 500)}`)
      summary.push({ scenario: scenario.name, status: 'error', latencyMs: `${latencyMs}ms` })
      return
    }

    const { data } = res
    const cents = estimateCents(data.usage)
    const executorUsage = data.usage.find((u) => u.role === 'executor')
    const advisorUsage = data.usage.find((u) => u.role === 'advisor')

    console.log(`OK`)
    console.log(`  advisorCalled: ${data.advisorCalled}`)
    console.log(`  usage:`)
    for (const u of data.usage) console.log(fmtUsageLine(u))
    console.log(`  custo estimado: ${cents.toFixed(4)}¢ (US$ ${(cents / 100).toFixed(6)})`)
    console.log(`  latência: ${latencyMs}ms (${(latencyMs / 1000).toFixed(2)}s)`)
    console.log(`  texto (primeiros ~300 chars):`)
    console.log(`  "${data.text.slice(0, 300).replace(/\n/g, ' ')}"`)

    summary.push({
      scenario: scenario.name,
      status: 'ok',
      advisorCalled: data.advisorCalled,
      executorTokens: executorUsage ? `${executorUsage.tokensIn}in/${executorUsage.tokensOut}out` : '-',
      advisorTokens: advisorUsage ? `${advisorUsage.tokensIn}in/${advisorUsage.tokensOut}out` : '-',
      costCents: `${cents.toFixed(4)}¢`,
      latencyMs: `${latencyMs}ms`,
    })
  } catch (e) {
    console.log(`EXCEÇÃO não tratada: ${e instanceof Error ? e.stack ?? e.message : String(e)}`)
    summary.push({ scenario: scenario.name, status: 'error' })
  }
}

async function main(): Promise<void> {
  console.log('Smoke test — llm-router (services/meeting-engine/src/lib/llm-router.ts)')
  console.log(
    `Keys presentes no ambiente: ANTHROPIC_API_KEY=${!!apiKeys.anthropic} GROQ_API_KEY=${!!apiKeys.groq} NVIDIA_API_KEY=${!!apiKeys.nvidia}`,
  )

  for (const scenario of SCENARIOS) {
    await runScenario(scenario)
  }

  console.log('\n=== Resumo ===')
  console.log('cenário       | status  | advisorCalled | tokens executor | tokens advisor | custo¢   | latência')
  console.log('--------------|---------|----------------|------------------|----------------|----------|----------')
  for (const row of summary) {
    console.log(
      `${row.scenario.padEnd(13)} | ${row.status.padEnd(7)} | ${String(row.advisorCalled ?? '-').padEnd(14)} | ${(row.executorTokens ?? '-').padEnd(16)} | ${(row.advisorTokens ?? '-').padEnd(14)} | ${(row.costCents ?? '-').padEnd(8)} | ${row.latencyMs ?? '-'}`,
    )
  }
}

await main()
