-- Wrapper em public: o client Supabase (rpc) só enxerga o schema public
create or replace function public.get_published_proposal(p_slug text)
returns table (title text, client_name text, content jsonb, theme jsonb, expires_at timestamptz)
language sql stable security definer
set search_path = public
as $$
  select p.title, p.client_name, p.content,
         coalesce(t.theme, '{}'::jsonb) as theme, p.expires_at
  from proposals p
  left join proposal_templates t on t.id = p.template_id
  where p.slug = p_slug
    and p.status = 'published'
    and (p.expires_at is null or p.expires_at > now());
$$;

grant execute on function public.get_published_proposal(text) to anon, authenticated;
