'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createCustomExpertAction, uploadExpertAvatarAction } from '../actions'

const TONES = ['Formal', 'Persuasivo', 'Amigável', 'Analítico', 'Assertivo']
const INTERRUPTIONS = [
  { key: 'discreto', label: 'Discreto' },
  { key: 'moderado', label: 'Moderado' },
  { key: 'ativo', label: 'Ativo' },
] as const

export function CustomCloneForm() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [description, setDescription] = useState('')
  const [tone, setTone] = useState('Persuasivo')
  const [interruption, setInterruption] = useState<'discreto' | 'moderado' | 'ativo'>('moderado')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  function pickAvatar(file: File | null) {
    setAvatarFile(file)
    setAvatarPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return file ? URL.createObjectURL(file) : null
    })
  }

  function submit() {
    setError(null)
    startTransition(async () => {
      let avatarUrl: string | undefined
      if (avatarFile) {
        const fd = new FormData()
        fd.set('file', avatarFile)
        const up = await uploadExpertAvatarAction(fd)
        if (up.error) {
          setError(`Foto: ${up.error}`)
          return
        }
        avatarUrl = up.url
      }
      const r = await createCustomExpertAction({ name, role, description, tone, interruption, avatarUrl })
      if (r?.error) setError(r.error)
      // sucesso → a action redireciona para /app/experts
    })
  }

  return (
    <div className="w-full max-w-4xl mx-auto">
      <header className="mb-10">
        <p className="font-label-caps text-label-caps text-primary-fixed tracking-widest mb-4">
          CLONES · SEU MODELO
        </p>
        <h1 className="font-display-lg text-3xl md:text-display-lg text-primary mb-4">
          Crie seu Clone Personalizado
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">
          Defina o tom, a expertise e o comportamento do seu agente exclusivo.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna esquerda — avatar + papel */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-surface p-6 rounded-xl border border-outline-variant/50">
            <label className="block font-label-caps text-label-caps text-on-surface-variant uppercase mb-4">
              Avatar do Agente
            </label>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
              className="hidden"
              onChange={(e) => pickAvatar(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              title="Enviar foto do clone"
              className="aspect-square w-full rounded-full border-2 border-dashed border-outline-variant/60 grid place-items-center overflow-hidden hover:border-primary-fixed transition-colors group relative"
            >
              {avatarPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarPreview} alt="Foto do clone" className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <div className="w-24 h-24 rounded-full bg-primary-fixed/10 border border-primary-fixed/40 grid place-items-center font-display-lg text-4xl font-bold text-primary-fixed">
                  {(name.trim().charAt(0) || '?').toUpperCase()}
                </div>
              )}
              <span className="absolute inset-x-0 bottom-0 py-2 bg-black/60 text-primary text-[12px] font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                <span className="material-symbols-outlined text-[16px]">photo_camera</span>
                {avatarPreview ? 'Trocar foto' : 'Enviar foto'}
              </span>
            </button>
            <p className="text-center font-body-sm text-body-sm text-on-surface-variant mt-3">
              {avatarPreview
                ? 'Foto selecionada — será salva ao criar o clone.'
                : 'Clique para enviar uma foto (PNG/JPG até 5MB) ou deixe a inicial.'}
            </p>
            {avatarPreview ? (
              <button
                type="button"
                onClick={() => pickAvatar(null)}
                className="block mx-auto mt-1 text-[12px] text-on-surface-variant hover:text-error transition-colors"
              >
                Remover foto
              </button>
            ) : null}
          </div>

          <div className="bg-surface p-6 rounded-xl border border-outline-variant/50">
            <label className="block font-label-caps text-label-caps text-on-surface-variant uppercase mb-2">
              Papel / Cargo
            </label>
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full bg-surface-container-highest border-b border-outline-variant text-primary font-body-md p-3 focus:outline-none focus:border-primary-fixed focus:ring-1 focus:ring-primary-fixed transition-all rounded-t-md"
              placeholder="Ex: Diretor de Vendas"
              type="text"
            />
          </div>
        </div>

        {/* Coluna direita — configuração detalhada */}
        <div className="lg:col-span-2">
          <div className="bg-surface p-8 rounded-xl border border-outline-variant/50 space-y-8">
            <div>
              <label className="block font-label-caps text-label-caps text-on-surface-variant uppercase mb-2">
                Nome do Clone
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-surface-container-highest border-b border-outline-variant text-primary font-headline-lg-mobile p-3 focus:outline-none focus:border-primary-fixed focus:ring-1 focus:ring-primary-fixed transition-all rounded-t-md"
                placeholder="Dê um nome ao seu agente…"
                type="text"
              />
            </div>

            <div>
              <label className="block font-label-caps text-label-caps text-on-surface-variant uppercase mb-2">
                Descrição da Personalidade
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full bg-surface-container-highest border border-outline-variant/50 text-primary font-body-md p-4 rounded-md focus:outline-none focus:border-primary-fixed focus:ring-1 focus:ring-primary-fixed transition-all resize-none"
                placeholder="Como o agente deve agir, quais jargões usar, diretrizes de comportamento…"
              />
            </div>

            <div>
              <label className="block font-label-caps text-label-caps text-on-surface-variant uppercase mb-3">
                Tom de Voz
              </label>
              <div className="flex flex-wrap gap-3">
                {TONES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTone(t)}
                    className={`px-4 py-2 rounded-full font-body-sm transition-colors border ${
                      tone === t
                        ? 'border-primary-fixed bg-primary-fixed/10 text-primary-fixed shadow-[0_0_8px_rgba(0,251,251,0.2)]'
                        : 'border-outline-variant text-on-surface-variant hover:border-primary-fixed hover:text-primary-fixed'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block font-label-caps text-label-caps text-on-surface-variant uppercase mb-3">
                Nível de Interrupção
              </label>
              <div className="flex gap-3">
                {INTERRUPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setInterruption(opt.key)}
                    className={`flex-1 px-4 py-3 rounded-md font-body-sm transition-colors border ${
                      interruption === opt.key
                        ? 'border-primary-fixed bg-primary-fixed/10 text-primary-fixed'
                        : 'border-outline-variant text-on-surface-variant hover:border-primary-fixed'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-2">
                Quão frequentemente o copiloto sugere durante a reunião.
              </p>
            </div>

            {error ? <p className="text-error font-body-sm">{error}</p> : null}
          </div>
        </div>
      </div>

      <div className="mt-10 flex items-center justify-between border-t border-outline-variant/30 pt-8">
        <button
          type="button"
          onClick={() => router.push('/app/experts')}
          className="px-6 py-3 font-label-caps text-label-caps uppercase text-on-surface border border-outline-variant rounded-md hover:border-primary-fixed hover:text-primary-fixed transition-colors"
        >
          Voltar
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending || !name || description.length < 20}
          className="px-8 py-3 font-label-caps text-label-caps uppercase bg-primary-fixed text-on-primary-fixed rounded-md hover:shadow-[0_0_20px_rgba(0,251,251,0.4)] transition-all disabled:opacity-50 flex items-center gap-2"
        >
          {pending ? 'Criando…' : 'Criar Clone'}
          <span className="material-symbols-outlined text-[18px]">check</span>
        </button>
      </div>
    </div>
  )
}
