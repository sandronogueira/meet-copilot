import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import { ContextManager, type BaseWithDocs } from './context-manager'

export default async function ContextPage() {
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
  const workspaceId = profile?.default_workspace_id as string

  const [{ data: bases }, { data: documents }] = await Promise.all([
    supabase
      .from('context_bases')
      .select('id, name, description, is_default, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at'),
    supabase
      .from('documents')
      .select('id, context_base_id, source_type, title, source_url, status, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false }),
  ])

  const basesWithDocs: BaseWithDocs[] = (bases ?? []).map((b) => ({
    ...b,
    documents: (documents ?? []).filter((d) => d.context_base_id === b.id),
  }))

  return <ContextManager bases={basesWithDocs} />
}
