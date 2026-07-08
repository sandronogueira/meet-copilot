// D7: distribuição da extensão como zip estático — a Chrome Web Store (com conta
// developer + review) é o caminho final; este zip destrava testers hoje.
export const dynamic = 'force-dynamic'

interface Step {
  title: string
  body: string
}

const steps: Step[] = [
  {
    title: 'Baixar e descompactar',
    body: 'Baixe o zip da extensão e descompacte numa pasta do seu computador.',
  },
  {
    title: 'Ativar o modo do desenvolvedor',
    body: 'No Chrome, acesse chrome://extensions e ative "Modo do desenvolvedor" (canto superior direito).',
  },
  {
    title: 'Carregar a extensão',
    body: 'Clique em "Carregar sem compactação" e escolha a pasta que você descompactou no passo 1.',
  },
  {
    title: 'Fixar e abrir',
    body: 'Fixe o ícone do Meet Copilot na barra do Chrome, abra a aba da sua reunião no Google Meet e clique no ícone.',
  },
  {
    title: 'Permitir o microfone',
    body: 'Na primeira vez, o Chrome vai pedir permissão de microfone — permita para o copiloto ouvir sua fala.',
  },
]

export default function InstallExtensionPage() {
  return (
    <div className="max-w-[720px] mx-auto">
      <header className="mb-8">
        <p className="font-label-caps text-label-caps text-primary-fixed tracking-widest mb-3">
          EXTENSÃO
        </p>
        <h1 className="font-display-lg text-3xl text-primary mb-2">Instalar a extensão</h1>
        <p className="text-on-surface-variant text-body-sm leading-relaxed">
          Durante o período de teste a extensão é instalada manualmente; a versão da Chrome
          Web Store vem em seguida.
        </p>
      </header>

      <div className="bg-[#111214] border border-white/10 rounded-xl p-6 md:p-8 mb-6">
        <a
          href="/downloads/meet-copilot-extension.zip"
          download
          className="inline-flex items-center justify-center px-5 py-3 rounded-md bg-primary-fixed text-on-primary-fixed font-bold text-sm hover:shadow-[0_0_15px_rgba(0,251,251,0.4)] transition-all"
        >
          Baixar meet-copilot-extension.zip
        </a>
      </div>

      <ol className="space-y-4">
        {steps.map((step, i) => (
          <li
            key={step.title}
            className="bg-[#111214] border border-white/10 rounded-xl p-5 flex gap-4"
          >
            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-surface-container-high border border-primary-fixed/40 text-primary-fixed font-bold text-sm flex items-center justify-center">
              {i + 1}
            </span>
            <div>
              <p className="text-primary font-medium mb-1">{step.title}</p>
              <p className="text-on-surface-variant text-body-sm leading-relaxed">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
