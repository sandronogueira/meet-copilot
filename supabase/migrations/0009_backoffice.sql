-- Visão cross-tenant do backoffice. SOMENTE service_role executa.
create or replace function public.backoffice_overview()
returns table (
  workspace_id uuid, workspace_name text, plan text,
  owner_user_id uuid, owner_email text, owner_name text,
  banned_until timestamptz, last_sign_in_at timestamptz, user_created_at timestamptz,
  members int, meetings int, talk_minutes numeric,
  tokens_in bigint, tokens_out bigint, suggestions int, proposals int, reports int,
  last_activity timestamptz
)
language sql stable security definer
set search_path = public, auth
as $$
  select
    w.id, w.name, w.plan,
    u.id, u.email::text, p.full_name,
    u.banned_until, u.last_sign_in_at, u.created_at,
    (select count(*)::int from workspace_members wm2 where wm2.workspace_id = w.id),
    (select count(*)::int from meetings mt where mt.workspace_id = w.id),
    coalesce((
      select round(sum(extract(epoch from spans.dur))/60.0, 1) from (
        select max(ts.created_at) - min(ts.created_at) as dur
        from transcript_segments ts join meetings mt2 on mt2.id = ts.meeting_id
        where mt2.workspace_id = w.id group by ts.meeting_id
      ) spans
    ), 0),
    coalesce((select sum(s.tokens_in)::bigint from suggestions s where s.workspace_id = w.id), 0),
    coalesce((select sum(s.tokens_out)::bigint from suggestions s where s.workspace_id = w.id), 0),
    (select count(*)::int from suggestions s where s.workspace_id = w.id),
    (select count(*)::int from proposals pr where pr.workspace_id = w.id),
    (select count(*)::int from reports r where r.workspace_id = w.id),
    (select max(ts.created_at) from transcript_segments ts
      join meetings mt3 on mt3.id = ts.meeting_id where mt3.workspace_id = w.id)
  from workspaces w
  join workspace_members wm on wm.workspace_id = w.id and wm.role = 'owner'
  join auth.users u on u.id = wm.user_id
  left join profiles p on p.user_id = u.id
  order by u.created_at desc;
$$;
revoke execute on function public.backoffice_overview() from public, anon, authenticated;

create or replace function public.backoffice_platform_stats()
returns table (users int, workspaces int, meetings int, meetings_7d int,
  suggestions int, tokens_in bigint, tokens_out bigint, proposals int)
language sql stable security definer set search_path = public, auth
as $$
  select
    (select count(*)::int from auth.users),
    (select count(*)::int from workspaces),
    (select count(*)::int from meetings),
    (select count(*)::int from meetings where created_at > now() - interval '7 days'),
    (select count(*)::int from suggestions),
    coalesce((select sum(tokens_in)::bigint from suggestions), 0),
    coalesce((select sum(tokens_out)::bigint from suggestions), 0),
    (select count(*)::int from proposals);
$$;
revoke execute on function public.backoffice_platform_stats() from public, anon, authenticated;
