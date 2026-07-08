import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import { ProfileForm } from './profile-form'

export const dynamic = 'force-dynamic'

export default async function ProfilePage() {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, self_label, default_workspace_id')
    .eq('user_id', user.id)
    .single()
  if (!profile?.default_workspace_id) redirect('/login')

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('name')
    .eq('id', profile.default_workspace_id)
    .single()

  return (
    <ProfileForm
      email={user.email ?? ''}
      fullName={(profile.full_name as string | null) ?? ''}
      selfLabel={(profile.self_label as string | null) ?? ''}
      workspaceName={(workspace?.name as string | null) ?? ''}
    />
  )
}
