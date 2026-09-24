-- Preserve the existing verification_context contract for web clients while
-- exposing server-computed assignment freshness to clients that need it.
create function public.verification_context_v2(p_project uuid)
returns table(request_id uuid, reporter_name text, assignment_is_current boolean)
language sql stable security definer set search_path='' as $$
 select q.id,m.display_name,
   coalesce(q.assignment_version=(
     select max(a.version) from public.assignment_versions a
     where a.project_id=q.project_id and a.activity_id=q.activity_id
   ),false) as assignment_is_current
 from public.verification_requests q
 join public.reports r on r.id=q.report_id
 join public.project_members m on m.project_id=r.project_id and m.user_id=r.author_id
 where q.project_id=p_project and app_private.can_read_verification(q.id)
$$;
revoke all on function public.verification_context_v2(uuid) from public,anon;
grant execute on function public.verification_context_v2(uuid) to authenticated;
