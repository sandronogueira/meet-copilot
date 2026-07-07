import { createClient } from '@supabase/supabase-js'
import { proposalContentSchema, type ProposalSection } from '@meet-copilot/shared'

export const dynamic = 'force-dynamic'

/**
 * Proposta comercial pública (estilo sofia.2020agency.co, dark premium).
 * Acesso somente via app.get_published_proposal (security definer) — o anon
 * key nunca lê as tabelas de domínio. Slug não-adivinhável + noindex.
 */
export default async function ProposalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  const { data } = await supabase.rpc('get_published_proposal', { p_slug: slug })
  const row = Array.isArray(data) ? data[0] : data
  const parsed = row ? proposalContentSchema.safeParse(row.content) : null

  if (!row || !parsed?.success) {
    return (
      <div className="min-h-dvh grid place-items-center bg-surface-container-lowest">
        <p className="text-on-surface-variant">Proposta não encontrada ou expirada.</p>
      </div>
    )
  }

  const sections = parsed.data.sections

  return (
    <div className="min-h-dvh bg-surface-container-lowest bg-grid text-on-surface">
      <main className="max-w-3xl mx-auto px-6 py-16 space-y-16">
        {sections.map((s) => (
          <Section key={s.id} s={s} />
        ))}
        <footer className="pt-8 border-t border-outline-variant/40 text-center">
          <p className="font-label-caps text-label-caps text-on-surface-variant uppercase">
            Gerada com Meet Copilot
          </p>
        </footer>
      </main>
    </div>
  )
}

function money(cents: number): string {
  return cents > 0
    ? (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : 'A definir'
}

function Section({ s }: { s: ProposalSection }) {
  switch (s.tipo) {
    case 'hero':
      return (
        <header className="pt-8">
          <p className="font-label-caps text-label-caps text-primary-fixed uppercase tracking-widest mb-4">
            Proposta comercial {s.clienteNome ? `· ${s.clienteNome}` : ''}
          </p>
          <h1 className="font-display-lg text-4xl md:text-display-lg text-primary">{s.headline}</h1>
          {s.subheadline ? (
            <p className="text-body-md text-on-surface-variant mt-4 max-w-xl">{s.subheadline}</p>
          ) : null}
        </header>
      )
    case 'contexto':
    case 'solucao':
      return (
        <section>
          <h2 className="font-headline-lg text-2xl text-primary mb-4">{s.titulo ?? ''}</h2>
          <p className="text-body-md text-on-surface-variant leading-relaxed whitespace-pre-line">{s.bodyMd}</p>
          {'pilares' in s && s.pilares.length > 0 ? (
            <div className="grid md:grid-cols-3 gap-4 mt-6">
              {s.pilares.map((p, i) => (
                <div key={i} className="bg-[#111214] border border-outline-variant rounded-xl p-4">
                  <h3 className="text-primary font-semibold mb-1">{p.titulo}</h3>
                  <p className="text-body-sm text-on-surface-variant">{p.descricao}</p>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      )
    case 'escopo':
      return (
        <section>
          <h2 className="font-headline-lg text-2xl text-primary mb-4">{s.titulo ?? 'Escopo'}</h2>
          <ul className="space-y-3">
            {s.itens.map((item, i) => (
              <li key={i} className="flex gap-3">
                <span className="text-primary-fixed shrink-0 mt-0.5">—</span>
                <div>
                  <span className="text-primary font-medium">{item.titulo}</span>
                  {item.descricao ? (
                    <p className="text-body-sm text-on-surface-variant">{item.descricao}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )
    case 'investimento':
      return (
        <section className="bg-[#111214] border border-primary-fixed/30 rounded-xl p-6 md:p-8 glow-effect">
          <h2 className="font-headline-lg text-2xl text-primary mb-6">{s.titulo ?? 'Investimento'}</h2>
          <div className="space-y-4">
            {s.linhas.map((l, i) => (
              <div key={i} className="flex items-baseline justify-between gap-4 border-b border-outline-variant/40 pb-3">
                <span className="text-on-surface">{l.descricao}</span>
                <span className="text-primary-fixed font-bold whitespace-nowrap">
                  {money(l.valorCents)}
                  {l.periodo ? <span className="text-on-surface-variant font-normal text-sm"> /{l.periodo}</span> : null}
                </span>
              </div>
            ))}
          </div>
          {s.observacoes ? (
            <p className="text-body-sm text-on-surface-variant mt-4">{s.observacoes}</p>
          ) : null}
        </section>
      )
    case 'cronograma':
      return (
        <section>
          <h2 className="font-headline-lg text-2xl text-primary mb-4">{s.titulo ?? 'Cronograma'}</h2>
          <ol className="space-y-4">
            {s.etapas.map((e, i) => (
              <li key={i} className="flex gap-4">
                <span className="w-8 h-8 rounded-full border border-primary-fixed text-primary-fixed grid place-items-center font-bold shrink-0">
                  {i + 1}
                </span>
                <div>
                  <span className="text-primary font-medium">{e.titulo}</span>
                  <span className="text-on-surface-variant text-body-sm"> — {e.duracao}</span>
                  {e.descricao ? <p className="text-body-sm text-on-surface-variant">{e.descricao}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )
    case 'cta':
      return (
        <section className="text-center py-8">
          <p className="text-body-md text-on-surface mb-6 max-w-lg mx-auto">{s.texto}</p>
          <span className="inline-block px-8 py-3 rounded-md bg-primary-fixed text-on-primary-fixed font-bold">
            {s.botaoLabel}
          </span>
          <p className="text-[12px] text-on-surface-variant mt-4">Proposta válida por {s.validadeDias} dias.</p>
        </section>
      )
    default:
      return null
  }
}
