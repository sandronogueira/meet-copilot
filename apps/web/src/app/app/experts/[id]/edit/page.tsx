import { redirect, notFound } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import { CustomCloneForm, type CloneInitial } from '../../new/custom-clone-form'

export const dynamic = 'force-dynamic'

export default async function EditClonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_workspace_id')
    .eq('user_id', user.id)
    .single()
  const workspaceId = profile?.default_workspace_id as string | null
  if (!workspaceId) redirect('/login')

  const { data: expert } = await supabase
    .from('sales_experts')
    .select('id, name, tagline, bio, avatar_url, interruption, style_prompt, question_frameworks, scope, workspace_id')
    .eq('id', id)
    .single()

  // só clones do próprio workspace podem ser editados (globais são do sistema)
  if (!expert || expert.scope !== 'workspace' || expert.workspace_id !== workspaceId) notFound()

  const qf = (expert.question_frameworks ?? {}) as { tone?: string; description?: string }
  const interruption = expert.interruption as 'discreto' | 'moderado' | 'ativo' | null

  const initial: CloneInitial = {
    id: expert.id as string,
    name: (expert.name as string) ?? '',
    role: (expert.tagline as string) === 'Clone personalizado' ? '' : ((expert.tagline as string) ?? ''),
    // description: qf.description (novos, sem perda) > reconstrução do style_prompt
    // (antigos, sem perda) > bio (último recurso, truncado em 300)
    description:
      qf.description ??
      extractDescription(expert.style_prompt as string | null) ??
      (expert.bio as string) ??
      '',
    tone: qf.tone ?? 'Persuasivo',
    interruption: interruption ?? 'moderado',
    avatarUrl: (expert.avatar_url as string | null) ?? null,
  }

  return <CustomCloneForm initial={initial} />
}

/**
 * Recupera a descrição do style_prompt de clones antigos (antes de guardarmos
 * a descrição em question_frameworks). Formato: [linha "Você atua como…"] +
 * descrição + "Tom de voz predominante:…" + "Nível de interrupção:…".
 */
function extractDescription(stylePrompt: string | null): string | null {
  if (!stylePrompt) return null
  let lines = stylePrompt.split('\n')
  if (lines[0]?.startsWith('Você atua como ')) lines = lines.slice(1)
  if (lines[lines.length - 1]?.startsWith('Nível de interrupção:')) lines = lines.slice(0, -1)
  if (lines[lines.length - 1]?.startsWith('Tom de voz predominante:')) lines = lines.slice(0, -1)
  const desc = lines.join('\n').trim()
  return desc.length >= 20 ? desc : null
}
