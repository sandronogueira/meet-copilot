'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { saveProfileStep, completeOnboardingAction } from './flow-actions'
import { createBaseAction, addDocumentAction, deleteDocumentAction } from '../app/context/actions'
import { selectExpertAction, createCustomExpertAction } from '../app/experts/actions'
import { signOutAction } from '../(auth)/actions'

// ── tipos vindos do server ────────────────────────────────────────────────────
export interface FlowDoc {
  id: string
  context_base_id: string
  source_type: string
  title: string
  status: string
}
export interface FlowBase {
  id: string
  name: string
  is_default: boolean
  documents: FlowDoc[]
}
export interface FlowExpert {
  id: string
  name: string
  tagline: string
  category: string | null
  avatar_url: string | null
}
export interface FlowProps {
  fullName: string
  selfLabel: string
  bases: FlowBase[]
  experts: FlowExpert[]
  selectedExpertId: string | null
}

type Step = 'perfil' | 'conhecimento' | 'clones' | 'config'
const STEPS: { key: Step; label: string; icon: string }[] = [
  { key: 'perfil', label: 'Perfil', icon: 'person' },
  { key: 'conhecimento', label: 'Conhecimento', icon: 'database' },
  { key: 'clones', label: 'Clones', icon: 'smart_toy' },
  { key: 'config', label: 'Configurações', icon: 'settings' },
]

const METHODOLOGIES = ['Consultiva', 'SPIN', 'Challenger', 'Direto ao ponto', 'Ainda não sigo uma']
const TONES = ['Formal', 'Equilibrado', 'Próximo e informal']
const OBJECTION_PRESETS = ['"Tá caro"', '"Vou pensar"', '"Já tenho fornecedor"', '"Me manda por e-mail"']
const HIGHLIGHT = new Set(['Alta Performance', 'Seu Modelo'])

export function OnboardingFlow(props: FlowProps) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('perfil')
  const stepIndex = STEPS.findIndex((s) => s.key === step)

  return (
    <div className="min-h-screen bg-surface-container-lowest text-on-surface relative">
      <div className="fixed inset-0 bg-grid pointer-events-none z-0" aria-hidden />

      {/* Top nav */}
      <nav className="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-6 md:px-margin-desktop py-4 bg-background/80 backdrop-blur-md border-b border-white/10">
        <div className="flex items-center gap-2 font-headline-lg text-primary">
          <div className="w-3 h-3 bg-primary-fixed rounded-sm shadow-[0_0_10px_rgba(0,251,251,0.5)]" />
          <span className="text-[20px] font-bold">Meet Copilot</span>
        </div>
        <form action={signOutAction}>
          <button className="text-on-surface-variant hover:text-primary-fixed transition-colors text-body-md">
            Sair
          </button>
        </form>
      </nav>

      <div className="pt-32 px-4 md:px-margin-desktop flex flex-col lg:flex-row gap-6 max-w-[1200px] mx-auto relative z-10 pb-16">
        {/* Stepper */}
        <aside className="hidden lg:flex flex-col gap-4 w-64 shrink-0 bg-surface-container-lowest p-6 rounded-xl border border-white/5 h-fit">
          <h2 className="font-label-caps text-label-caps text-primary-fixed mb-2">
            ETAPA {stepIndex + 1} DE {STEPS.length}
          </h2>
          {STEPS.map((s, i) => {
            const state = i < stepIndex ? 'done' : i === stepIndex ? 'current' : 'todo'
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => i <= stepIndex && setStep(s.key)}
                className={`rounded-lg p-4 text-left flex items-center gap-3 transition-all ${
                  state === 'current'
                    ? 'border border-primary-fixed bg-surface-container-highest text-primary-fixed glow-active'
                    : state === 'done'
                      ? 'border border-white/5 text-on-surface-variant hover:border-primary-fixed/50 hover:bg-surface-container-high'
                      : 'border border-white/5 text-on-surface-variant opacity-50 cursor-default'
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">{s.icon}</span>
                <div className="flex flex-col">
                  <span className={`text-sm ${state === 'current' ? 'font-bold' : 'font-medium'}`}>{s.label}</span>
                  <span className="text-xs opacity-70">
                    {state === 'done' ? 'Concluído' : state === 'current' ? 'Em andamento' : 'Pendente'}
                  </span>
                </div>
              </button>
            )
          })}
        </aside>

        {/* Conteúdo do passo */}
        <main className="flex-1 min-w-0">
          {step === 'perfil' && (
            <PerfilStep {...props} onDone={() => setStep('conhecimento')} />
          )}
          {step === 'conhecimento' && (
            <ConhecimentoStep
              bases={props.bases}
              onBack={() => setStep('perfil')}
              onNext={() => setStep('clones')}
              refresh={() => router.refresh()}
            />
          )}
          {step === 'clones' && (
            <ClonesStep
              experts={props.experts}
              selectedId={props.selectedExpertId}
              onBack={() => setStep('conhecimento')}
              onNext={() => setStep('config')}
              refresh={() => router.refresh()}
            />
          )}
          {step === 'config' && <ConfigStep onBack={() => setStep('clones')} />}
        </main>
      </div>
    </div>
  )
}

// ── Passo Perfil ──────────────────────────────────────────────────────────────
function PerfilStep({
  fullName,
  selfLabel,
  onDone,
}: {
  fullName: string
  selfLabel: string
  onDone: () => void
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState(fullName)
  const [self, setSelf] = useState(selfLabel || fullName)
  const [siteUrl, setSiteUrl] = useState('')
  const [description, setDescription] = useState('')
  const [segment, setSegment] = useState('')
  const [methodology, setMethodology] = useState('Consultiva')
  const [tone, setTone] = useState('Equilibrado')
  const [objections, setObjections] = useState<string[]>([])
  const [objDraft, setObjDraft] = useState('')
  const [icp, setIcp] = useState('')

  function save() {
    setError(null)
    start(async () => {
      const r = await saveProfileStep({
        fullName: name,
        selfLabel: self,
        siteUrl,
        description,
        segment,
        methodology,
        tone,
        objections,
        icp,
      })
      if (r.error) setError(r.error)
      else onDone()
    })
  }

  return (
    <div>
      <StepHeader
        kicker={`ETAPA 1 DE 4 — PERFIL`}
        title="Quem está na reunião — e como você vende?"
        subtitle="A IA usa isso para reconhecer você e adaptar as sugestões à sua abordagem."
      />
      <Card>
        <Field label="Seu nome completo">
          <Input value={name} onChange={setName} />
        </Field>
        <Field label="Como você aparece nas reuniões" hint="Igual ao seu nome no Meet/Zoom.">
          <Input value={self} onChange={setSelf} placeholder="ex.: Sandro Nogueira" />
        </Field>
        <Field label="Site da empresa (opcional)" hint="Vamos ler o site e absorver serviços e diferenciais.">
          <Input value={siteUrl} onChange={setSiteUrl} placeholder="https://suaempresa.com.br" />
        </Field>
        <Field label="Descreva sua empresa como descreveria a um cliente">
          <Textarea value={description} onChange={setDescription} placeholder="O que fazem, para quem, e o que os torna diferentes…" />
        </Field>
        <Field label="Segmento">
          <Input value={segment} onChange={setSegment} placeholder="ex.: agência de marketing, clínica, SaaS…" />
        </Field>
        <Field label="Metodologia que mais se parece com você">
          <ChipRow options={METHODOLOGIES} value={methodology} onPick={setMethodology} />
        </Field>
        <Field label="Tom com o cliente">
          <ChipRow options={TONES} value={tone} onPick={setTone} />
        </Field>
        <Field label="Objeções que você mais escuta">
          <div className="flex flex-wrap gap-2 mb-2">
            {OBJECTION_PRESETS.filter((p) => !objections.includes(p)).map((p) => (
              <Chip key={p} onClick={() => setObjections([...objections, p])}>
                + {p}
              </Chip>
            ))}
          </div>
          {objections.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {objections.map((o) => (
                <Chip key={o} on onClick={() => setObjections(objections.filter((x) => x !== o))}>
                  {o} ×
                </Chip>
              ))}
            </div>
          )}
          <Input
            value={objDraft}
            onChange={setObjDraft}
            placeholder="Digite e aperte Enter"
            onEnter={() => {
              const v = objDraft.trim()
              if (v && !objections.includes(v)) setObjections([...objections, v])
              setObjDraft('')
            }}
          />
        </Field>
        <Field label="Seu cliente ideal (ICP)">
          <Textarea value={icp} onChange={setIcp} placeholder="ex.: clínicas de estética com 2+ unidades faturando acima de R$ 200k/mês…" />
        </Field>
        {error && <p className="text-error text-body-sm">{error}</p>}
      </Card>
      <StepNav rightLabel={pending ? 'Salvando…' : 'Continuar'} onRight={save} rightDisabled={pending} />
    </div>
  )
}

// ── Passo Conhecimento (base manager) ─────────────────────────────────────────
function ConhecimentoStep({
  bases,
  onBack,
  onNext,
  refresh,
}: {
  bases: FlowBase[]
  onBack: () => void
  onNext: () => void
  refresh: () => void
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(bases[0]?.id ?? null)
  const [showNew, setShowNew] = useState(false)
  const [baseName, setBaseName] = useState('')
  const [kind, setKind] = useState<'url' | 'text'>('url')
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')

  const selected = bases.find((b) => b.id === selectedId) ?? bases[0] ?? null

  function run(fn: () => Promise<{ error?: string }>, ok?: () => void) {
    setError(null)
    start(async () => {
      const r = await fn()
      if (r.error) setError(r.error)
      else {
        ok?.()
        refresh()
      }
    })
  }

  const STATUS: Record<string, string> = { pending: 'na fila', processing: 'processando', ready: 'pronta', error: 'erro' }
  const TYPE: Record<string, string> = {
    url: 'Site/URL', text: 'Texto', file: 'Arquivo', pricing_table: 'Tabela de preços', case: 'Case', onboarding_profile: 'Perfil (onboarding)',
  }

  return (
    <div>
      <StepHeader
        kicker="ETAPA 2 DE 4 — CONHECIMENTO"
        title="O que o seu copiloto deve saber?"
        subtitle="Adicione sites, documentos ou textos. Na hora da call, você escolhe qual base o agente carrega."
      />
      <div className="flex flex-col xl:flex-row gap-6 items-start">
        <div className="w-full xl:w-64 flex flex-col gap-3 shrink-0">
          {bases.map((b) => (
            <button
              key={b.id}
              onClick={() => setSelectedId(b.id)}
              className={`rounded-lg p-4 text-left flex flex-col gap-1 transition-all ${
                selected?.id === b.id
                  ? 'border border-primary-fixed bg-surface-container-highest text-primary glow-active'
                  : 'border border-white/5 bg-surface text-on-surface-variant hover:border-white/20'
              }`}
            >
              <span className="font-medium text-sm">{b.name}</span>
              <span className="text-xs opacity-70">
                {b.documents.length} documento{b.documents.length === 1 ? '' : 's'}{b.is_default ? ' · padrão' : ''}
              </span>
            </button>
          ))}
          {showNew ? (
            <div className="bg-surface border border-white/10 rounded-lg p-4 space-y-3">
              <Input value={baseName} onChange={setBaseName} placeholder="Nome da base" />
              <div className="flex gap-2">
                <button
                  disabled={pending}
                  onClick={() => run(() => createBaseAction({ name: baseName }), () => { setBaseName(''); setShowNew(false) })}
                  className="flex-1 bg-surface-tint text-on-primary font-medium rounded-lg px-3 py-2 text-sm"
                >
                  Criar
                </button>
                <button onClick={() => setShowNew(false)} className="px-3 py-2 text-sm text-on-surface-variant border border-white/10 rounded-lg">
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowNew(true)}
              className="border border-dashed border-white/20 text-on-surface-variant rounded-lg p-3 text-center hover:border-primary-fixed hover:text-primary-fixed transition-all text-sm font-medium flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              Nova base
            </button>
          )}
        </div>

        {selected && (
          <div className="flex-1 w-full bg-[#111214] border border-white/10 rounded-xl p-6 md:p-8">
            <h3 className="font-headline-lg text-xl text-primary mb-6 font-semibold">{selected.name}</h3>
            <div className="flex gap-2 mb-6">
              <Tab on={kind === 'url'} onClick={() => setKind('url')}>Site / URL</Tab>
              <Tab on={kind === 'text'} onClick={() => setKind('text')}>Texto livre</Tab>
            </div>
            {kind === 'url' ? (
              <div className="flex gap-3 mb-8">
                <Input value={url} onChange={setUrl} placeholder="https://site-do-cliente.com.br" />
                <button
                  disabled={pending || !url}
                  onClick={() => run(() => addDocumentAction({ kind: 'url', contextBaseId: selected.id, url }), () => setUrl(''))}
                  className="bg-surface-tint text-on-primary font-medium rounded-lg px-6 py-2 text-sm shrink-0 disabled:opacity-50"
                >
                  Adicionar
                </button>
              </div>
            ) : (
              <div className="mb-8 space-y-3">
                <Input value={title} onChange={setTitle} placeholder="Título (ex: Briefing da conta)" />
                <Textarea value={text} onChange={setText} placeholder="Cole aqui qualquer conhecimento que o copiloto deva ter…" />
                <button
                  disabled={pending || !title || !text}
                  onClick={() => run(() => addDocumentAction({ kind: 'text', contextBaseId: selected.id, title, text }), () => { setTitle(''); setText('') })}
                  className="bg-surface-tint text-on-primary font-medium rounded-lg px-6 py-2 text-sm disabled:opacity-50"
                >
                  Adicionar
                </button>
              </div>
            )}
            {error && <p className="text-error text-body-sm mb-4">{error}</p>}
            {selected.documents.length === 0 ? (
              <div className="border border-dashed border-white/15 rounded-lg p-8 text-center text-on-surface-variant text-body-sm">
                Base vazia. Adicione o site do cliente, briefings, tabelas — tudo vira conhecimento do copiloto.
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {selected.documents.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between pb-4 border-b border-white/5">
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium text-primary truncate">{doc.title}</span>
                      <span className="text-xs text-on-surface-variant font-mono mt-1">
                        {TYPE[doc.source_type] ?? doc.source_type} · {STATUS[doc.status] ?? doc.status}
                      </span>
                    </div>
                    <button
                      disabled={pending}
                      onClick={() => run(() => deleteDocumentAction(doc.id))}
                      className="text-xs border border-white/10 rounded-md px-3 py-1.5 text-on-surface-variant hover:text-error hover:border-error/50 shrink-0"
                    >
                      Remover
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <StepNav leftLabel="Voltar" onLeft={onBack} rightLabel="Continuar" onRight={onNext} />
    </div>
  )
}

// ── Passo Clones (galeria + criar) ────────────────────────────────────────────
function ClonesStep({
  experts,
  selectedId,
  onBack,
  onNext,
  refresh,
}: {
  experts: FlowExpert[]
  selectedId: string | null
  onBack: () => void
  onNext: () => void
  refresh: () => void
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(selectedId)
  const [creating, setCreating] = useState(false)

  function pick(id: string) {
    setError(null)
    setSelected(id)
    start(async () => {
      const r = await selectExpertAction(id)
      if (r.error) {
        setError(r.error)
        setSelected(selectedId)
      } else refresh()
    })
  }

  if (creating) {
    return <ClonesCreate onCancel={() => setCreating(false)} onCreated={() => { setCreating(false); refresh() }} />
  }

  return (
    <div>
      <StepHeader
        kicker="ETAPA 3 DE 4 — CLONES DE PERSONALIDADE"
        title="Dê uma personalidade ao seu agente"
        subtitle="Escolha um clone de especialista ou uma metodologia institucional para guiar o comportamento do seu Copilot."
      />
      {error && <p className="text-error text-body-sm mb-4">{error}</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {experts.map((e) => (
          <ExpertCard key={e.id} expert={e} selected={selected === e.id} onClick={() => pick(e.id)} disabled={pending} />
        ))}
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="text-left bg-surface-container-low border border-dashed border-primary-fixed/50 rounded-xl p-6 hover:border-primary-fixed hover:bg-primary-fixed/5 transition-all"
        >
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-full border border-dashed border-primary-fixed/50 bg-surface-container grid place-items-center shrink-0">
              <span className="material-symbols-outlined text-primary-fixed text-[32px]">person_add</span>
            </div>
            <div>
              <h3 className="font-headline-lg text-xl text-primary mb-1">Criar Clone Personalizado</h3>
              <span className="inline-block px-2 py-1 rounded border border-primary-fixed/30 font-label-caps text-[10px] text-primary-fixed mb-3">
                Seu Modelo
              </span>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Crie um clone único enviando textos e diretrizes para moldar o comportamento do agente.
              </p>
            </div>
          </div>
        </button>
      </div>
      <StepNav leftLabel="Voltar" onLeft={onBack} rightLabel="Continuar para Configurações" onRight={onNext} rightDisabled={!selected} />
    </div>
  )
}

function ClonesCreate({ onCancel, onCreated }: { onCancel: () => void; onCreated: () => void }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [description, setDescription] = useState('')
  const [tone, setTone] = useState('Persuasivo')
  const [interruption, setInterruption] = useState<'discreto' | 'moderado' | 'ativo'>('moderado')

  function submit() {
    setError(null)
    start(async () => {
      const r = await createCustomExpertAction({ name, role, description, tone, interruption })
      if (r?.error) setError(r.error)
      else onCreated()
    })
  }

  return (
    <div>
      <StepHeader kicker="CLONES · SEU MODELO" title="Crie seu Clone Personalizado" subtitle="Defina o tom, a expertise e o comportamento do seu agente exclusivo." />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <label className="block font-label-caps text-label-caps text-on-surface-variant uppercase mb-4">Avatar do Agente</label>
            <div className="aspect-square w-full rounded-full border-2 border-dashed border-outline-variant/60 grid place-items-center">
              <div className="w-24 h-24 rounded-full bg-primary-fixed/10 border border-primary-fixed/40 grid place-items-center font-display-lg text-4xl font-bold text-primary-fixed">
                {(name.trim().charAt(0) || '?').toUpperCase()}
              </div>
            </div>
          </Card>
          <Card>
            <Field label="Papel / Cargo">
              <Input value={role} onChange={setRole} placeholder="Ex: Diretor de Vendas" />
            </Field>
          </Card>
        </div>
        <div className="lg:col-span-2">
          <Card>
            <Field label="Nome do Clone">
              <Input value={name} onChange={setName} placeholder="Dê um nome ao seu agente…" />
            </Field>
            <Field label="Descrição da Personalidade">
              <Textarea value={description} onChange={setDescription} placeholder="Como o agente deve agir, jargões, diretrizes de comportamento…" />
            </Field>
            <Field label="Tom de Voz">
              <ChipRow options={['Formal', 'Persuasivo', 'Amigável', 'Analítico', 'Assertivo']} value={tone} onPick={setTone} />
            </Field>
            <Field label="Nível de Interrupção">
              <div className="flex gap-3">
                {(['discreto', 'moderado', 'ativo'] as const).map((o) => (
                  <button
                    key={o}
                    onClick={() => setInterruption(o)}
                    className={`flex-1 px-4 py-3 rounded-md text-body-sm border capitalize transition-colors ${
                      interruption === o ? 'border-primary-fixed bg-primary-fixed/10 text-primary-fixed' : 'border-outline-variant text-on-surface-variant hover:border-primary-fixed'
                    }`}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </Field>
            {error && <p className="text-error text-body-sm">{error}</p>}
          </Card>
        </div>
      </div>
      <StepNav leftLabel="Voltar" onLeft={onCancel} rightLabel={pending ? 'Criando…' : 'Criar Clone'} onRight={submit} rightDisabled={pending || !name || description.length < 20} />
    </div>
  )
}

// ── Passo Configurações (finalizar) ───────────────────────────────────────────
function ConfigStep({ onBack }: { onBack: () => void }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <div>
      <StepHeader kicker="ETAPA 4 DE 4 — CONFIGURAÇÕES" title="Tudo pronto para a sua primeira reunião" subtitle="Seu copiloto já sabe quem você é, o que sua empresa vende e com que personalidade agir." />
      <Card>
        <div className="flex flex-col gap-4">
          {[
            ['person', 'Perfil e abordagem configurados'],
            ['database', 'Base de conhecimento alimentada'],
            ['smart_toy', 'Clone de personalidade escolhido'],
          ].map(([icon, label]) => (
            <div key={label} className="flex items-center gap-3 text-on-surface">
              <span className="material-symbols-outlined text-primary-fixed">{icon}</span>
              <span className="text-body-md">{label}</span>
              <span className="material-symbols-outlined text-primary-fixed ml-auto" style={{ fontVariationSettings: "'FILL' 1" }}>
                check_circle
              </span>
            </div>
          ))}
        </div>
        {error && <p className="text-error text-body-sm mt-4">{error}</p>}
      </Card>
      <StepNav
        leftLabel="Voltar"
        onLeft={onBack}
        rightLabel={pending ? 'Finalizando…' : 'Ir para o painel'}
        rightDisabled={pending}
        onRight={() =>
          start(async () => {
            const r = await completeOnboardingAction()
            if (r?.error) setError(r.error)
          })
        }
      />
    </div>
  )
}

// ── Cartão de clone (com avatar) ──────────────────────────────────────────────
function ExpertCard({
  expert,
  selected,
  onClick,
  disabled,
}: {
  expert: FlowExpert
  selected: boolean
  onClick: () => void
  disabled?: boolean
}) {
  const hot = expert.category ? HIGHLIGHT.has(expert.category) : false
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`text-left bg-[#111214] rounded-xl p-6 relative transition-colors ${
        selected ? 'border border-primary-fixed glow-effect' : 'border border-outline-variant hover:border-primary-fixed'
      }`}
    >
      {selected && (
        <span className="material-symbols-outlined absolute top-4 right-4 text-primary-fixed" style={{ fontVariationSettings: "'FILL' 1" }}>
          check_circle
        </span>
      )}
      <div className="flex items-start gap-4">
        {expert.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={expert.avatar_url}
            alt={expert.name}
            className={`w-16 h-16 rounded-full object-cover shrink-0 border ${selected ? 'border-primary-fixed' : 'border-outline-variant'}`}
          />
        ) : (
          <div className={`w-16 h-16 rounded-full grid place-items-center shrink-0 font-display-lg text-2xl font-bold ${
            selected ? 'border border-primary-fixed text-primary-fixed bg-primary-fixed/10' : 'border border-outline-variant text-on-surface-variant bg-surface-container'
          }`}>
            {expert.name.replace(/^(O|A)\s+/, '').charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-headline-lg text-xl text-primary mb-1">{expert.name}</h3>
          {expert.category && (
            <span className={`inline-block px-2 py-1 rounded font-label-caps text-[10px] mb-3 border ${
              hot ? 'border-primary-fixed/30 bg-primary-fixed/10 text-primary-fixed' : 'border-outline-variant text-on-surface-variant'
            }`}>
              {expert.category}
            </span>
          )}
          <p className="font-body-sm text-body-sm text-on-surface-variant">{expert.tagline}</p>
        </div>
      </div>
    </button>
  )
}

// ── Primitivos de UI ──────────────────────────────────────────────────────────
function StepHeader({ kicker, title, subtitle }: { kicker: string; title: string; subtitle: string }) {
  return (
    <header className="mb-8 max-w-2xl">
      <p className="font-label-caps text-label-caps text-primary-fixed tracking-widest mb-4">{kicker}</p>
      <h1 className="font-display-lg text-3xl md:text-4xl text-primary mb-3 tracking-tight">{title}</h1>
      <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">{subtitle}</p>
    </header>
  )
}
function Card({ children }: { children: ReactNode }) {
  return <div className="bg-[#111214] border border-white/10 rounded-xl p-6 md:p-8 space-y-6">{children}</div>
}
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label className="block font-label-caps text-label-caps text-on-surface-variant uppercase mb-2">{label}</label>
      {children}
      {hint && <p className="font-body-sm text-body-sm text-on-surface-variant mt-1.5 opacity-70">{hint}</p>}
    </div>
  )
}
function Input({
  value,
  onChange,
  placeholder,
  onEnter,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  onEnter?: () => void
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && onEnter) {
          e.preventDefault()
          onEnter()
        }
      }}
      className="w-full bg-surface-container-high border border-white/10 rounded-lg px-4 py-2.5 text-primary placeholder-on-surface-variant focus:outline-none focus:border-primary-fixed text-body-sm"
    />
  )
}
function Textarea({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={4}
      className="w-full bg-surface-container-high border border-white/10 rounded-lg px-4 py-2.5 text-primary placeholder-on-surface-variant focus:outline-none focus:border-primary-fixed text-body-sm resize-none"
    />
  )
}
function ChipRow({ options, value, onPick }: { options: string[]; value: string; onPick: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-3">
      {options.map((o) => (
        <Chip key={o} on={value === o} onClick={() => onPick(o)}>
          {o}
        </Chip>
      ))}
    </div>
  )
}
function Chip({ children, on, onClick }: { children: ReactNode; on?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 rounded-full text-body-sm border transition-colors ${
        on
          ? 'border-primary-fixed bg-primary-fixed/10 text-primary-fixed shadow-[0_0_8px_rgba(0,251,251,0.2)]'
          : 'border-outline-variant text-on-surface-variant hover:border-primary-fixed hover:text-primary-fixed'
      }`}
    >
      {children}
    </button>
  )
}
function Tab({ children, on, onClick }: { children: ReactNode; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-1.5 rounded-full border text-sm font-medium transition-colors ${
        on ? 'border-primary-fixed text-primary-fixed bg-primary-fixed/10' : 'border-white/10 text-on-surface-variant hover:border-white/30'
      }`}
    >
      {children}
    </button>
  )
}
function StepNav({
  leftLabel,
  onLeft,
  rightLabel,
  onRight,
  rightDisabled,
}: {
  leftLabel?: string
  onLeft?: () => void
  rightLabel: string
  onRight: () => void
  rightDisabled?: boolean
}) {
  return (
    <div className="mt-8 flex items-center justify-between border-t border-outline-variant/30 pt-8">
      {onLeft ? (
        <button
          type="button"
          onClick={onLeft}
          className="px-6 py-3 font-label-caps text-label-caps uppercase text-on-surface border border-outline-variant rounded-md hover:border-primary-fixed hover:text-primary-fixed transition-colors"
        >
          {leftLabel ?? 'Voltar'}
        </button>
      ) : (
        <span />
      )}
      <button
        type="button"
        onClick={onRight}
        disabled={rightDisabled}
        className="px-8 py-3 font-label-caps text-label-caps uppercase bg-primary-fixed text-on-primary-fixed rounded-md hover:shadow-[0_0_20px_rgba(0,251,251,0.4)] transition-all disabled:opacity-50 flex items-center gap-2"
      >
        {rightLabel}
        <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
      </button>
    </div>
  )
}
