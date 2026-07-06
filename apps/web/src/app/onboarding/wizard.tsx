'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { saveStep1, saveStep2, saveStep3, saveStep4, saveStep5 } from './actions'

export interface Expert {
  id: string
  name: string
  slug: string
  tagline: string
  sample_questions: string[]
}

const TOTAL_STEPS = 5

const METHODOLOGIES = ['Consultiva', 'SPIN', 'Challenger', 'Direto ao ponto', 'Ainda não sigo uma']
const TONES = ['Formal', 'Equilibrado', 'Próximo e informal']
const OBJECTION_PRESETS = ['"Tá caro"', '"Vou pensar"', '"Já tenho fornecedor"', '"Me manda por e-mail"']

interface Props {
  experts: Expert[]
  initialFullName: string
  initialSelfLabel: string
  initialState: Record<string, unknown>
}

export function OnboardingWizard({ experts, initialFullName, initialSelfLabel, initialState }: Props) {
  // retoma de onde parou (passos 1-based; state salvo por passo concluído)
  const resumeStep = [1, 2, 3, 4].reduce(
    (acc, n) => (initialState[`step${n}`] ? n + 1 : acc),
    1,
  )
  const [step, setStep] = useState(resumeStep)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // passo 1
  const [fullName, setFullName] = useState(initialFullName)
  const [selfLabel, setSelfLabel] = useState(initialSelfLabel || initialFullName)
  // passo 2
  const [siteUrl, setSiteUrl] = useState('')
  const [description, setDescription] = useState('')
  const [segment, setSegment] = useState('')
  const [step2Saved, setStep2Saved] = useState(Boolean(initialState.step2))
  // passo 3
  const [products, setProducts] = useState('')
  const [ticket, setTicket] = useState('')
  const [pricingNotes, setPricingNotes] = useState('')
  // passo 4
  const [methodology, setMethodology] = useState('Consultiva')
  const [tone, setTone] = useState('Equilibrado')
  const [objections, setObjections] = useState<string[]>([])
  const [objectionDraft, setObjectionDraft] = useState('')
  const [icp, setIcp] = useState('')
  // passo 5
  const [expertId, setExpertId] = useState<string | null>(null)

  function advance(action: () => Promise<{ error?: string }>) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (result?.error) {
        setError(result.error)
        return
      }
      setStep((s) => Math.min(s + 1, TOTAL_STEPS))
    })
  }

  function addObjection(value: string) {
    const v = value.trim()
    if (v && !objections.includes(v) && objections.length < 12) {
      setObjections([...objections, v])
    }
    setObjectionDraft('')
  }

  const stepMeta: Record<number, { kicker: string; title: string; lede: string }> = {
    1: {
      kicker: 'Passo 1 · Você',
      title: 'Antes de tudo: quem está na reunião?',
      lede: 'A IA nunca sugere nada enquanto VOCÊ está falando — pra isso, precisa te reconhecer.',
    },
    2: {
      kicker: 'Passo 2 · Sua empresa',
      title: 'Ensine a IA sobre o seu negócio',
      lede: 'É daqui que saem as perguntas certas. Quanto melhor a base, melhor o copiloto.',
    },
    3: {
      kicker: 'Passo 3 · Sua oferta',
      title: 'O que você vende — e por quanto',
      lede: 'Preços viram a tabela oficial das suas propostas. A IA nunca inventa valores.',
    },
    4: {
      kicker: 'Passo 4 · Sua abordagem',
      title: 'Como você vende?',
      lede: 'As sugestões vão soar como VOCÊ vende — não como um robô genérico.',
    },
    5: {
      kicker: 'Passo 5 · Seu Especialista',
      title: 'Quem vai soprar no seu ouvido?',
      lede: 'Cada Especialista tem um estilo de pergunta e fechamento. Dá pra trocar a cada reunião.',
    },
  }

  const meta = stepMeta[step]!

  return (
    <div className="wizard-shell">
      <header className="wizard-top">
        <span className="brand-mark">
          <span className="brand-dot" /> Meet Copilot
        </span>
        <div className="wizard-progress" aria-label={`Passo ${step} de ${TOTAL_STEPS}`}>
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <span
              key={i}
              className="wizard-dot"
              data-state={i + 1 < step ? 'done' : i + 1 === step ? 'current' : 'todo'}
            />
          ))}
        </div>
      </header>

      <section className="wizard-card" key={step}>
        <p className="kicker step-label">{meta.kicker}</p>
        <h2>{meta.title}</h2>
        <p className="lede">{meta.lede}</p>

        {step === 1 && (
          <StepBlock>
            <div className="field">
              <label htmlFor="ob-name">Seu nome completo</label>
              <input id="ob-name" className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="ob-self">Como você aparece nas reuniões</label>
              <input
                id="ob-self"
                className="input"
                value={selfLabel}
                onChange={(e) => setSelfLabel(e.target.value)}
                placeholder="ex.: Sandro Nogueira"
              />
              <p className="hint">Igual ao seu nome no Meet/Zoom — é assim que a IA sabe quando é você falando.</p>
            </div>
          </StepBlock>
        )}

        {step === 2 && (
          <StepBlock>
            <div className="field">
              <label htmlFor="ob-site">Site da empresa (opcional, recomendado)</label>
              <input
                id="ob-site"
                className="input"
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                placeholder="https://suaempresa.com.br"
                inputMode="url"
              />
              <p className="hint">Vamos ler o site inteiro e absorver serviços, cases e diferenciais.</p>
            </div>
            <div className="field">
              <label htmlFor="ob-desc">Descreva sua empresa como descreveria a um cliente</label>
              <textarea
                id="ob-desc"
                className="input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="O que vocês fazem, para quem, e o que torna vocês diferentes…"
              />
            </div>
            <div className="field">
              <label htmlFor="ob-seg">Segmento</label>
              <input
                id="ob-seg"
                className="input"
                value={segment}
                onChange={(e) => setSegment(e.target.value)}
                placeholder="ex.: agência de marketing, clínica, SaaS…"
              />
            </div>
            {step2Saved ? <p className="form-ok">Salvo — site na fila para leitura completa.</p> : null}
          </StepBlock>
        )}

        {step === 3 && (
          <StepBlock>
            <div className="field">
              <label htmlFor="ob-prod">Produtos / serviços (um por linha)</label>
              <textarea
                id="ob-prod"
                className="input"
                value={products}
                onChange={(e) => setProducts(e.target.value)}
                placeholder={'Gestão de tráfego pago\nBranding completo\nSAC com IA…'}
              />
            </div>
            <div className="field">
              <label htmlFor="ob-ticket">Faixa de ticket</label>
              <input
                id="ob-ticket"
                className="input"
                value={ticket}
                onChange={(e) => setTicket(e.target.value)}
                placeholder="ex.: R$ 3.000 a R$ 15.000/mês"
              />
            </div>
            <div className="field">
              <label htmlFor="ob-pricing">Preços e condições (opcional)</label>
              <textarea
                id="ob-pricing"
                className="input"
                value={pricingNotes}
                onChange={(e) => setPricingNotes(e.target.value)}
                placeholder="Pacotes, setup, descontos que você costuma praticar…"
              />
              <p className="hint">Isso vira a tabela oficial das propostas — dá pra refinar depois em Configurações.</p>
            </div>
          </StepBlock>
        )}

        {step === 4 && (
          <StepBlock>
            <div className="field">
              <label>Metodologia que mais se parece com você</label>
              <div className="chip-row" role="radiogroup">
                {METHODOLOGIES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className="chip"
                    data-on={methodology === m}
                    onClick={() => setMethodology(m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>Tom com o cliente</label>
              <div className="chip-row" role="radiogroup">
                {TONES.map((t) => (
                  <button key={t} type="button" className="chip" data-on={tone === t} onClick={() => setTone(t)}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label htmlFor="ob-obj">Objeções que você mais escuta</label>
              <div className="chip-row" style={{ marginBottom: '0.5rem' }}>
                {OBJECTION_PRESETS.filter((p) => !objections.includes(p)).map((p) => (
                  <button key={p} type="button" className="chip" onClick={() => addObjection(p)}>
                    + {p}
                  </button>
                ))}
              </div>
              {objections.length > 0 && (
                <div className="chip-row" style={{ marginBottom: '0.5rem' }}>
                  {objections.map((o) => (
                    <button
                      key={o}
                      type="button"
                      className="chip"
                      data-on="true"
                      onClick={() => setObjections(objections.filter((x) => x !== o))}
                    >
                      {o} <span className="chip-x">×</span>
                    </button>
                  ))}
                </div>
              )}
              <input
                id="ob-obj"
                className="input"
                value={objectionDraft}
                onChange={(e) => setObjectionDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addObjection(objectionDraft)
                  }
                }}
                placeholder="Digite e aperte Enter para adicionar"
              />
            </div>
            <div className="field">
              <label htmlFor="ob-icp">Seu cliente ideal (ICP)</label>
              <textarea
                id="ob-icp"
                className="input"
                value={icp}
                onChange={(e) => setIcp(e.target.value)}
                placeholder="ex.: clínicas de estética com 2+ unidades faturando acima de R$ 200k/mês…"
              />
            </div>
          </StepBlock>
        )}

        {step === 5 && (
          <StepBlock>
            <div className="expert-grid">
              {experts.map((expert) => (
                <button
                  key={expert.id}
                  type="button"
                  className="expert-card"
                  data-on={expertId === expert.id}
                  onClick={() => setExpertId(expert.id)}
                >
                  <span className="avatar">{expert.name.replace(/^(O|A)\s/, '').charAt(0)}</span>
                  <h3>{expert.name}</h3>
                  <p className="tagline">{expert.tagline}</p>
                  {expert.sample_questions[0] ? (
                    <p className="sample">“{expert.sample_questions[0]}”</p>
                  ) : null}
                </button>
              ))}
            </div>
            <p className="hint" style={{ marginTop: '1rem' }}>
              Em breve: especialistas com nome próprio — clones de grandes vendedores.
            </p>
          </StepBlock>
        )}

        {error ? <p className="form-error">{error}</p> : null}

        <div className="wizard-nav">
          <button
            type="button"
            className="btn btn-ghost btn-inline"
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1 || pending}
          >
            ← Voltar
          </button>

          {step === 1 && (
            <button
              type="button"
              className="btn btn-primary btn-inline"
              disabled={pending}
              onClick={() => advance(() => saveStep1({ fullName, selfLabel }))}
            >
              {pending ? 'Salvando…' : 'Continuar →'}
            </button>
          )}
          {step === 2 && (
            <button
              type="button"
              className="btn btn-primary btn-inline"
              disabled={pending}
              onClick={() =>
                advance(async () => {
                  const r = await saveStep2({ siteUrl, description, segment })
                  if (!r.error) setStep2Saved(true)
                  return r
                })
              }
            >
              {pending ? 'Absorvendo…' : 'Continuar →'}
            </button>
          )}
          {step === 3 && (
            <button
              type="button"
              className="btn btn-primary btn-inline"
              disabled={pending}
              onClick={() => advance(() => saveStep3({ products, ticket, pricingNotes }))}
            >
              {pending ? 'Salvando…' : 'Continuar →'}
            </button>
          )}
          {step === 4 && (
            <button
              type="button"
              className="btn btn-primary btn-inline"
              disabled={pending}
              onClick={() => advance(() => saveStep4({ methodology, tone, objections, icp }))}
            >
              {pending ? 'Salvando…' : 'Continuar →'}
            </button>
          )}
          {step === 5 && (
            <button
              type="button"
              className="btn btn-primary btn-inline"
              disabled={pending || !expertId}
              onClick={() => {
                if (!expertId) return
                setError(null)
                startTransition(async () => {
                  // redireciona para /app no sucesso (redirect lança internamente)
                  const r = await saveStep5({ expertId })
                  if (r?.error) setError(r.error)
                })
              }}
            >
              {pending ? 'Finalizando…' : 'Começar a usar'}
            </button>
          )}
        </div>
      </section>
    </div>
  )
}

function StepBlock({ children }: { children: ReactNode }) {
  return <div>{children}</div>
}
