-- Phase 2: project-scoped storage and assignment authority. No actual-progress writes yet.
create schema if not exists app_private;
revoke all on schema app_private from public, anon;
grant usage on schema app_private to authenticated, service_role;

create table public.projects (
  id uuid primary key, name text not null, site_timezone text not null default 'Asia/Kolkata',
  active_revision_id uuid, policy_version integer not null default 1 check(policy_version > 0),
  schedule_version bigint not null default 0 check(schedule_version >= 0), synthetic boolean not null default true
);
create table public.project_members (
  project_id uuid references public.projects(id), user_id uuid references auth.users(id),
  display_name text not null, role text not null check(role in ('reporter','supervisor','planner','manager')),
  contractor_id uuid, discipline_scope text[] not null default '{}', work_front_scope text[] not null default '{}',
  capabilities text[] not null default '{}', active boolean not null default true,
  version integer not null default 1, primary key(project_id,user_id)
);
create table public.schedule_revisions (
  project_id uuid references public.projects(id), id uuid not null, label text not null,
  source_system text not null, created_at timestamptz not null default now(),
  primary key(project_id,id), unique(id)
);
alter table public.projects add foreign key(id,active_revision_id) references public.schedule_revisions(project_id,id);
create table public.wbs_nodes (
  project_id uuid not null, revision_id uuid not null, id uuid not null, parent_id uuid, name text not null,
  primary key(project_id,revision_id,id),
  foreign key(project_id,revision_id) references public.schedule_revisions(project_id,id),
  foreign key(project_id,revision_id,parent_id) references public.wbs_nodes(project_id,revision_id,id)
);
create table public.activities (
  project_id uuid references public.projects(id), id uuid not null, external_id text not null,
  contractor_id uuid not null, active boolean not null default true,
  primary key(project_id,id), unique(id), unique(project_id,external_id)
);
create table public.activity_plan_versions (
  project_id uuid not null, activity_id uuid not null, revision_id uuid not null, wbs_id uuid not null,
  name text not null, discipline text not null check(discipline in ('Civil','Piping','Electrical')),
  location text not null, stage text not null, baseline_start date not null, baseline_finish date not null,
  planned_start date not null, planned_finish date not null, target_quantity numeric not null check(target_quantity > 0), unit text not null,
  primary key(project_id,activity_id,revision_id),
  foreign key(project_id,activity_id) references public.activities(project_id,id),
  foreign key(project_id,revision_id,wbs_id) references public.wbs_nodes(project_id,revision_id,id),
  check(planned_finish >= planned_start), check(baseline_finish >= baseline_start)
);
create table public.execution_items (
  project_id uuid not null, id uuid not null, activity_id uuid not null, item_tag text not null, stage text not null,
  target_quantity numeric not null check(target_quantity > 0), unit text not null,
  primary key(project_id,id), foreign key(project_id,activity_id) references public.activities(project_id,id),
  unique(project_id,activity_id,item_tag,stage)
);
create table public.activity_actuals (
  project_id uuid not null, activity_id uuid not null, actual_start date, actual_finish date,
  version integer not null default 0, primary key(project_id,activity_id),
  foreign key(project_id,activity_id) references public.activities(project_id,id),
  check(actual_finish is null or (actual_start is not null and actual_finish >= actual_start))
);
create table public.assignment_versions (
  project_id uuid not null, activity_id uuid not null, version integer not null check(version > 0),
  reporter_id uuid not null, supervisor_id uuid not null, effective_from date not null, effective_to date not null,
  recorded_at timestamptz not null default now(), actor_id uuid, reason text not null,
  primary key(project_id,activity_id,version),
  foreign key(project_id,activity_id) references public.activities(project_id,id),
  foreign key(project_id,reporter_id) references public.project_members(project_id,user_id),
  foreign key(project_id,supervisor_id) references public.project_members(project_id,user_id),
  check(effective_to >= effective_from), check(reporter_id <> supervisor_id)
);
create table public.assignment_commands (
  project_id uuid references public.projects(id), command_id uuid not null, actor_id uuid not null,
  payload jsonb not null, result jsonb not null, primary key(project_id,command_id)
);
create table public.admin_audit (
  id bigint generated always as identity primary key, project_id uuid references public.projects(id),
  actor text not null, action text not null, reason text not null, detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create function app_private.is_member(p_project uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.project_members m where m.project_id=p_project and m.user_id=auth.uid() and m.active)
$$;
create function app_private.is_planner(p_project uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.project_members m where m.project_id=p_project and m.user_id=auth.uid() and m.active and m.role in ('planner','manager'))
$$;
create function app_private.can_read_activity(p_project uuid,p_activity uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.project_members m join public.activities a on a.project_id=m.project_id
    join public.projects p on p.id=a.project_id
    join public.activity_plan_versions v on v.project_id=a.project_id and v.activity_id=a.id and v.revision_id=p.active_revision_id
    where m.project_id=p_project and a.id=p_activity and m.user_id=auth.uid() and m.active and a.active
    and (m.role in ('planner','manager') or (
      m.contractor_id=a.contractor_id and v.discipline=any(m.discipline_scope)
      and (cardinality(m.work_front_scope)=0 or v.location=any(m.work_front_scope))
      and (m.role='supervisor' or (m.role='reporter' and exists(
        select 1 from public.assignment_versions x where x.project_id=a.project_id and x.activity_id=a.id and x.reporter_id=m.user_id
        and x.version=(select max(y.version) from public.assignment_versions y where y.project_id=x.project_id and y.activity_id=x.activity_id)
      )))
    ))
  )
$$;

alter table public.projects enable row level security;
create policy member_projects on public.projects for select to authenticated using(app_private.is_member(id));
alter table public.project_members enable row level security;
create policy scoped_members on public.project_members for select to authenticated using(app_private.is_member(project_id) and (user_id=auth.uid() or app_private.is_planner(project_id)));
alter table public.schedule_revisions enable row level security;
create policy scoped_revisions on public.schedule_revisions for select to authenticated using(app_private.is_member(project_id));
alter table public.wbs_nodes enable row level security;
create policy planner_wbs on public.wbs_nodes for select to authenticated using(app_private.is_planner(project_id));
alter table public.activities enable row level security;
create policy scoped_activities on public.activities for select to authenticated using(app_private.can_read_activity(project_id,id));
alter table public.activity_plan_versions enable row level security;
create policy scoped_plans on public.activity_plan_versions for select to authenticated using(app_private.can_read_activity(project_id,activity_id));
alter table public.execution_items enable row level security;
create policy scoped_items on public.execution_items for select to authenticated using(app_private.can_read_activity(project_id,activity_id));
alter table public.activity_actuals enable row level security;
create policy scoped_actuals on public.activity_actuals for select to authenticated using(app_private.can_read_activity(project_id,activity_id));
alter table public.assignment_versions enable row level security;
create policy scoped_assignments on public.assignment_versions for select to authenticated using(app_private.can_read_activity(project_id,activity_id) and (reporter_id=auth.uid() or supervisor_id=auth.uid() or app_private.is_planner(project_id)));
alter table public.assignment_commands enable row level security;
alter table public.admin_audit enable row level security;
create policy planner_audit on public.admin_audit for select to authenticated using(app_private.is_planner(project_id));

revoke all on all tables in schema public from anon, authenticated;
grant select on public.projects,public.project_members,public.schedule_revisions,public.wbs_nodes,public.activities,public.activity_plan_versions,public.execution_items,public.activity_actuals,public.assignment_versions,public.admin_audit to authenticated;
grant all on all tables in schema public to service_role;
grant usage,select on all sequences in schema public to service_role;
revoke all on all functions in schema app_private from public,anon;
grant execute on all functions in schema app_private to authenticated,service_role;

create function app_private.immutable_history() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'History is immutable; append a new revision' using errcode='23514'; end $$;
create trigger immutable_plan before update or delete on public.activity_plan_versions for each row execute function app_private.immutable_history();
create trigger immutable_assignment before update or delete on public.assignment_versions for each row execute function app_private.immutable_history();
create trigger immutable_audit before update or delete on public.admin_audit for each row execute function app_private.immutable_history();

create function public.assign_activity(p_project uuid,p_activity uuid,p_command uuid,p_expected_version integer,p_reporter uuid,p_supervisor uuid,p_from date,p_to date,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare existing public.assignment_commands; current_version integer; result jsonb; input jsonb;
begin
  if not app_private.is_planner(p_project) then raise exception 'Assignment authority required' using errcode='42501'; end if;
  perform 1 from public.projects where id=p_project for update;
  -- Re-check membership after obtaining the project lock; audited membership changes take this lock too.
  perform 1 from public.project_members where project_id=p_project and user_id=auth.uid() and active and role in ('planner','manager') for share;
  if not found then raise exception 'Membership changed' using errcode='42501'; end if;
  input=jsonb_build_object('activity',p_activity,'expected',p_expected_version,'reporter',p_reporter,'supervisor',p_supervisor,'from',p_from,'to',p_to,'reason',p_reason);
  select * into existing from public.assignment_commands where project_id=p_project and command_id=p_command;
  if found then
    if existing.actor_id<>auth.uid() or existing.payload<>input then raise exception 'IDEMPOTENCY_MISMATCH' using errcode='40001'; end if;
    return existing.result;
  end if;
  if p_from is null or p_to is null or p_to<p_from or length(trim(coalesce(p_reason,'')))=0 or p_reporter=p_supervisor then raise exception 'Invalid assignment facts' using errcode='22023'; end if;
  if not exists(select 1 from public.activities a join public.projects p on p.id=a.project_id join public.activity_plan_versions v on v.project_id=a.project_id and v.activity_id=a.id and v.revision_id=p.active_revision_id
    join public.project_members m on m.project_id=a.project_id and m.user_id=p_reporter
    join public.project_members s on s.project_id=a.project_id and s.user_id=p_supervisor
    where a.project_id=p_project and a.id=p_activity and a.active and m.active and m.role='reporter' and m.contractor_id=a.contractor_id
      and v.discipline=any(m.discipline_scope) and (cardinality(m.work_front_scope)=0 or v.location=any(m.work_front_scope))
      and s.active and s.role in ('supervisor','manager') and (s.role='manager' or (s.contractor_id=a.contractor_id and v.discipline=any(s.discipline_scope) and (cardinality(s.work_front_scope)=0 or v.location=any(s.work_front_scope))))
  ) then raise exception 'Invalid reporter or supervisor scope' using errcode='42501'; end if;
  select coalesce(max(version),0) into current_version from public.assignment_versions where project_id=p_project and activity_id=p_activity;
  if p_expected_version is distinct from current_version then raise exception 'STALE_ASSIGNMENT' using errcode='40001'; end if;
  insert into public.assignment_versions values(p_project,p_activity,current_version+1,p_reporter,p_supervisor,p_from,p_to,now(),auth.uid(),p_reason);
  result=jsonb_build_object('activity_id',p_activity,'version',current_version+1);
  insert into public.assignment_commands values(p_project,p_command,auth.uid(),input,result);
  insert into public.admin_audit(project_id,actor,action,reason,detail) values(p_project,auth.uid()::text,'assignment.appended',p_reason,result);
  return result;
end $$;
revoke all on function public.assign_activity(uuid,uuid,uuid,integer,uuid,uuid,date,date,text) from public,anon;
grant execute on function public.assign_activity(uuid,uuid,uuid,integer,uuid,uuid,date,date,text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('evidence','evidence',false,5242880,array['image/jpeg','image/png','audio/webm','audio/mp4','text/plain']) on conflict(id) do nothing;
-- Phase 2 personal evidence namespace. Report-bound reservations replace this in the capture phase.
create policy own_evidence_insert on storage.objects for insert to authenticated with check(bucket_id='evidence' and (storage.foldername(name))[2]=auth.uid()::text and exists(select 1 from public.project_members m where m.project_id::text=(storage.foldername(name))[1] and m.user_id=auth.uid() and m.active));
create policy own_or_planner_evidence_read on storage.objects for select to authenticated using(bucket_id='evidence' and exists(select 1 from public.project_members m where m.project_id::text=(storage.foldername(name))[1] and m.user_id=auth.uid() and m.active and ((storage.foldername(name))[2]=auth.uid()::text or m.role in ('planner','manager'))));

create index membership_user on public.project_members(user_id,project_id) where active;
create index assignment_reporter on public.assignment_versions(project_id,reporter_id,activity_id,version desc);
create index plan_scope on public.activity_plan_versions(project_id,revision_id,discipline,location);
