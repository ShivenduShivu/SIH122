-- Operator-only commands. The application never receives a service credential.
create function public.provision_project(p_id uuid,p_name text,p_actor text,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if length(trim(p_actor))=0 or length(trim(p_reason))=0 then raise exception 'Audit context required'; end if;
  insert into public.projects(id,name) values(p_id,p_name) on conflict(id) do nothing;
  if found then
    insert into public.admin_audit(project_id,actor,action,reason) values(p_id,p_actor,'project.created',p_reason);
  end if;
end $$;
revoke all on function public.provision_project(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.provision_project(uuid,text,text,text) to service_role;

create function public.set_project_member(p_project uuid,p_user uuid,p_expected_version integer,p_member jsonb,p_actor text,p_reason text)
returns integer language plpgsql security definer set search_path='' as $$
declare old public.project_members; next_version integer;
begin
  if coalesce(length(trim(p_actor)),0)=0 or coalesce(length(trim(p_reason)),0)=0 then raise exception 'Audit context required' using errcode='22023'; end if;
  perform 1 from public.projects where id=p_project for update;
  if not found then raise exception 'Unknown project' using errcode='22023'; end if;
  select * into old from public.project_members where project_id=p_project and user_id=p_user;
  if coalesce(old.version,0) is distinct from p_expected_version then raise exception 'STALE_MEMBERSHIP' using errcode='40001'; end if;
  next_version=coalesce(old.version,0)+1;
  insert into public.project_members(project_id,user_id,display_name,role,contractor_id,discipline_scope,work_front_scope,capabilities,active,version)
  values(p_project,p_user,p_member->>'display_name',p_member->>'role',(p_member->>'contractor_id')::uuid,
    array(select jsonb_array_elements_text(p_member->'discipline_scope')),
    array(select jsonb_array_elements_text(p_member->'work_front_scope')),
    array(select jsonb_array_elements_text(p_member->'capabilities')),(p_member->>'active')::boolean,next_version)
  on conflict(project_id,user_id) do update set display_name=excluded.display_name,role=excluded.role,contractor_id=excluded.contractor_id,
    discipline_scope=excluded.discipline_scope,work_front_scope=excluded.work_front_scope,capabilities=excluded.capabilities,active=excluded.active,version=excluded.version;
  update public.projects set policy_version=policy_version+1 where id=p_project;
  insert into public.admin_audit(project_id,actor,action,reason,detail)
    values(p_project,p_actor,'membership.changed',p_reason,jsonb_build_object('user_id',p_user,'before',to_jsonb(old),'after',p_member,'version',next_version));
  return next_version;
end $$;
revoke all on function public.set_project_member(uuid,uuid,integer,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.set_project_member(uuid,uuid,integer,jsonb,text,text) to service_role;
revoke all on function app_private.immutable_history() from public,anon,authenticated;
create trigger immutable_revision before update or delete on public.schedule_revisions for each row execute function app_private.immutable_history();
create trigger immutable_wbs before update or delete on public.wbs_nodes for each row execute function app_private.immutable_history();
