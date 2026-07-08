-- ============================================================================
-- Meet Copilot — rollup da tela Reuniões
-- Duração real (span da transcrição), tem relatório, tem proposta e slug —
-- tudo numa chamada. security definer + is_member escopa por workspace.
-- ============================================================================

create or replace function public.list_meetings_overview(p_workspace uuid, p_limit int default 20)
returns table (
  id uuid,
  title text,
  status text,
  created_at timestamptz,
  duration_ms bigint,
  has_report boolean,
  has_proposal boolean,
  proposal_slug text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    m.title,
    m.status,
    m.created_at,
    coalesce(
      extract(epoch from (
        select max(ts.created_at) - min(ts.created_at)
        from transcript_segments ts where ts.meeting_id = m.id
      )) * 1000, 0
    )::bigint as duration_ms,
    exists(select 1 from reports r where r.meeting_id = m.id) as has_report,
    exists(select 1 from proposals p where p.meeting_id = m.id) as has_proposal,
    (select p.slug from proposals p where p.meeting_id = m.id order by p.created_at desc limit 1) as proposal_slug
  from meetings m
  where m.workspace_id = p_workspace and app.is_member(p_workspace)
  order by m.created_at desc
  limit p_limit;
$$;

grant execute on function public.list_meetings_overview(uuid, int) to authenticated;
