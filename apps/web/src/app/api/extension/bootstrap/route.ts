import { NextResponse } from 'next/server'
import { err } from '@meet-copilot/shared'
import { supabaseServer } from '@/lib/supabase/server'

/**
 * GET /api/extension/bootstrap — chamado pelo side panel ANTES de iniciar.
 * Devolve as bases de conhecimento e os clones do usuário para ele escolher
 * o contexto da reunião (ou começar "no escuro") sem sair do painel.
 */
export async function GET() {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json(err('UNAUTHORIZED', 'Faça login em meet.2020agency.co'), { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_workspace_id')
    .eq('user_id', user.id)
    .single()
  const workspaceId = profile?.default_workspace_id as string | null
  if (!workspaceId) return NextResponse.json(err('NO_WORKSPACE', 'workspace não encontrado'), { status: 400 })

  const [{ data: bases }, { data: experts }, { data: ws }] = await Promise.all([
    supabase
      .from('context_bases')
      .select('id, name, is_default')
      .eq('workspace_id', workspaceId)
      .order('created_at'),
    supabase
      .from('sales_experts')
      .select('id, name, category')
      .eq('status', 'active')
      .order('scope', { ascending: false })
      .order('created_at'),
    supabase.from('workspaces').select('settings').eq('id', workspaceId).single(),
  ])

  const settings = (ws?.settings ?? {}) as { default_expert_id?: string; hidden_expert_ids?: string[] }
  const hidden = new Set(settings.hidden_expert_ids ?? [])

  return NextResponse.json({
    ok: true,
    data: {
      bases: bases ?? [],
      experts: (experts ?? []).filter((e) => !hidden.has(e.id)),
      activeExpertId: settings.default_expert_id ?? null,
      defaultBaseId: (bases ?? []).find((b) => b.is_default)?.id ?? null,
    },
  })
}
