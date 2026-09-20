-- Phase 5A: initial schedule import only. Existing accepted work is never replaced.
alter table public.activity_plan_versions drop constraint activity_plan_versions_discipline_check;
alter table public.activity_plan_versions add constraint activity_plan_versions_discipline_check check(discipline in ('Civil','Piping','Electrical','General','HSE','Quality','Structural','Mechanical','Instrumentation'));
alter table public.activity_plan_versions alter column target_quantity drop not null;
alter table public.activity_plan_versions alter column unit drop not null;
alter table public.activity_plan_versions add constraint quantity_pair check((target_quantity is null)=(unit is null));
alter table public.activity_plan_versions add column node_kind text not null default 'task' check(node_kind in ('task','milestone'));
alter table public.activity_plan_versions add column source_metadata jsonb not null default '{}';

create table public.schedule_imports (
 id uuid primary key, project_id uuid not null references public.projects(id), author_id uuid not null references auth.users(id),
 contractor_id uuid not null, files jsonb not null, input_hash text not null, expected_revision uuid,
 status text not null default 'reserved' check(status in ('reserved','queued','running','ready','invalid','failed','activated')),
 preview jsonb, preview_hash text, error_code text, revision_id uuid not null default gen_random_uuid(),
 lease_token uuid, lease_until timestamptz, attempts integer not null default 0,
 created_at timestamptz not null default now(), activated_at timestamptz, activated_by uuid
);
alter table public.schedule_imports enable row level security;
create policy planner_import_read on public.schedule_imports for select to authenticated using(app_private.is_planner(project_id));
create index imports_pending on public.schedule_imports(status,created_at);
create table public.schedule_nodes (
 project_id uuid not null, revision_id uuid not null, external_id text not null, id uuid not null default gen_random_uuid(),
 parent_external_id text, name text not null, node_kind text not null, reportable boolean not null,
 source_level text not null, source_wbs text not null, planned_start date not null, planned_finish date not null,
 metadata jsonb not null, primary key(project_id,revision_id,external_id), unique(project_id,revision_id,id),
 foreign key(project_id,revision_id) references public.schedule_revisions(project_id,id),
 foreign key(project_id,revision_id,parent_external_id) references public.schedule_nodes(project_id,revision_id,external_id),
 check(planned_finish>=planned_start),check(node_kind in ('summary','task','milestone','external_dependency')),
 check(not reportable or node_kind in ('task','milestone'))
);
alter table public.schedule_nodes enable row level security;
create policy planner_nodes_read on public.schedule_nodes for select to authenticated using(app_private.is_planner(project_id));
create trigger immutable_schedule_node before update or delete on public.schedule_nodes for each row execute function app_private.immutable_history();
grant select on public.schedule_imports, public.schedule_nodes to authenticated;
grant all on public.schedule_imports, public.schedule_nodes to service_role;

create function public.reserve_schedule_import(p_project uuid,p_command uuid,p_contractor uuid,p_files jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare existing public.schedule_imports; f jsonb; fingerprint text;
begin
 perform 1 from public.projects where id=p_project for update;
 if not app_private.is_planner(p_project) then raise exception 'Planner required' using errcode='42501';end if;
 if p_command is null or p_contractor is null or not exists(select 1 from public.project_members where project_id=p_project and contractor_id=p_contractor and active) then raise exception 'Choose a project contractor' using errcode='22023';end if;
 if jsonb_typeof(p_files) is distinct from 'array' or jsonb_array_length(p_files) not between 1 and 2 then raise exception 'One or two source files required' using errcode='22023';end if;
 for f in select value from jsonb_array_elements(p_files) loop
  if (f->>'id')::uuid is null or coalesce(length(f->>'name'),0) not between 1 and 160 or f->>'name' ~ '[\\/]' or f->>'profile' is null or f->>'profile' not in ('gwp_construction','gwp_l3','canonical_csv') or coalesce((f->>'bytes')::integer,0) not between 1 and 5242880 or coalesce(f->>'sha256','') !~ '^[a-f0-9]{64}$' then raise exception 'Invalid file declaration' using errcode='22023';end if;
 end loop;
 if (select count(distinct value->>'id') from jsonb_array_elements(p_files))<>jsonb_array_length(p_files) or (select count(distinct value->>'profile') from jsonb_array_elements(p_files))<>jsonb_array_length(p_files) or (jsonb_array_length(p_files)>1 and exists(select 1 from jsonb_array_elements(p_files) where value->>'profile'='canonical_csv')) then raise exception 'Duplicate or incompatible profiles' using errcode='22023';end if;
 fingerprint=encode(extensions.digest(jsonb_build_object('contractor',p_contractor,'files',p_files)::text,'sha256'),'hex');
 select * into existing from public.schedule_imports where id=p_command;
 if found then
  if existing.project_id<>p_project or existing.author_id<>auth.uid() or existing.input_hash<>fingerprint then raise exception 'COMMAND_ID_REUSED' using errcode='40001';end if;
  return existing.id;
 end if;
 if exists(select 1 from public.projects where id=p_project and active_revision_id is not null) then raise exception 'INITIAL_IMPORT_ONLY' using errcode='22023';end if;
 insert into public.schedule_imports(id,project_id,author_id,contractor_id,files,input_hash) values(p_command,p_project,auth.uid(),p_contractor,p_files,fingerprint);
 insert into public.admin_audit(project_id,actor,action,reason,detail) values(p_project,auth.uid()::text,'schedule.import_reserved','Initial schedule import',jsonb_build_object('importId',p_command));
 return p_command;
end $$;
revoke all on function public.reserve_schedule_import(uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function public.reserve_schedule_import(uuid,uuid,uuid,jsonb) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('schedule-imports','schedule-imports',false,5242880,array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv','application/octet-stream']) on conflict(id) do nothing;
create policy reserved_schedule_upload on storage.objects for insert to authenticated with check(
 bucket_id='schedule-imports' and exists(select 1 from public.schedule_imports i cross join lateral jsonb_array_elements(i.files) f
 where i.project_id::text=(storage.foldername(name))[1] and i.id::text=(storage.foldername(name))[2]
 and (f->>'id')||case when f->>'profile'='canonical_csv' then '.csv' else '.xlsx' end=storage.filename(name)
 and i.status='reserved' and i.author_id=auth.uid() and app_private.is_planner(i.project_id)));
create policy planner_schedule_file_read on storage.objects for select to authenticated using(
 bucket_id='schedule-imports' and exists(select 1 from public.schedule_imports i where i.project_id::text=(storage.foldername(name))[1] and i.id::text=(storage.foldername(name))[2] and app_private.is_planner(i.project_id)));

create function public.finalize_schedule_import(p_id uuid) returns text language plpgsql security definer set search_path='' as $$
declare i public.schedule_imports; f jsonb; path text;
begin
 select * into i from public.schedule_imports where id=p_id for update;
 if not found or not app_private.is_planner(i.project_id) then raise exception 'Planner required' using errcode='42501';end if;
 if i.status<>'reserved' then return i.status;end if;
 for f in select value from jsonb_array_elements(i.files) loop
  path=i.project_id::text||'/'||i.id::text||'/'||(f->>'id')||case when f->>'profile'='canonical_csv' then '.csv' else '.xlsx' end;
  if not exists(select 1 from storage.objects where bucket_id='schedule-imports' and name=path and (metadata->>'size')::bigint=(f->>'bytes')::bigint) then raise exception 'UPLOAD_INCOMPLETE' using errcode='22023';end if;
 end loop;
 update public.schedule_imports set status='queued' where id=i.id;
 return 'queued';
end $$;
revoke all on function public.finalize_schedule_import(uuid) from public,anon;
grant execute on function public.finalize_schedule_import(uuid) to authenticated;

create function public.lease_schedule_import() returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.schedule_imports;
begin
 update public.schedule_imports set status='failed',error_code='IMPORT_RETRY_EXHAUSTED',lease_token=null,lease_until=null where status='running' and lease_until<now() and attempts>=3;
 select * into i from public.schedule_imports where status='queued' or (status='running' and lease_until<now() and attempts<3) order by created_at for update skip locked limit 1;
 if not found then return null;end if;
 update public.schedule_imports set status='running',lease_token=gen_random_uuid(),lease_until=now()+interval '90 seconds',attempts=attempts+1 where id=i.id returning * into i;
 return to_jsonb(i);
end $$;
create function public.complete_schedule_import(p_id uuid,p_token uuid,p_preview jsonb,p_error text) returns void language plpgsql security definer set search_path='' as $$
declare i public.schedule_imports;
begin
 select * into i from public.schedule_imports where id=p_id for update;
 if not found or i.status<>'running' or i.lease_token is distinct from p_token or i.lease_until<=now() then raise exception 'LEASE_LOST' using errcode='40001';end if;
 if p_error is null and (jsonb_typeof(p_preview->'nodes') is distinct from 'array' or jsonb_array_length(p_preview->'nodes')>2500 or jsonb_typeof(p_preview->'errors') is distinct from 'array') then raise exception 'Invalid preview';end if;
 update public.schedule_imports set preview=p_preview,preview_hash=encode(extensions.digest(p_preview::text,'sha256'),'hex'),error_code=p_error,
 status=case when p_error is not null then 'failed' when jsonb_array_length(p_preview->'errors')>0 then 'invalid' else 'ready' end,lease_until=null,lease_token=null where id=i.id;
end $$;
revoke all on function public.lease_schedule_import(), public.complete_schedule_import(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.lease_schedule_import(), public.complete_schedule_import(uuid,uuid,jsonb,text) to service_role;

create function public.activate_schedule_import(p_id uuid,p_preview_hash text,p_expected_revision uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare i public.schedule_imports; p public.projects; node record; a uuid;
begin
 select * into i from public.schedule_imports where id=p_id;
 if not found or not app_private.is_planner(i.project_id) then raise exception 'Planner required' using errcode='42501';end if;
 select * into p from public.projects where id=i.project_id for update;
 select * into i from public.schedule_imports where id=p_id for update;
 if not app_private.is_planner(i.project_id) then raise exception 'Membership changed' using errcode='42501';end if;
 if i.preview_hash is distinct from p_preview_hash or p_preview_hash is null then raise exception 'STALE_IMPORT_PREVIEW' using errcode='40001';end if;
 if i.expected_revision is distinct from p_expected_revision then raise exception 'STALE_IMPORT_PREVIEW' using errcode='40001';end if;
 if i.status='activated' then return i.revision_id;end if;
 if p.active_revision_id is distinct from p_expected_revision then raise exception 'STALE_IMPORT_PREVIEW' using errcode='40001';end if;
 if p.active_revision_id is not null or exists(select 1 from public.reports where project_id=p.id) or exists(select 1 from public.activities where project_id=p.id) then raise exception 'INITIAL_IMPORT_ONLY' using errcode='22023';end if;
 if i.status<>'ready' or jsonb_array_length(i.preview->'nodes')=0 or jsonb_array_length(i.preview->'errors')<>0 then raise exception 'IMPORT_NOT_READY' using errcode='22023';end if;
 if not exists(select 1 from public.project_members where project_id=p.id and contractor_id=i.contractor_id and active) then raise exception 'Contractor scope changed' using errcode='40001';end if;
 insert into public.schedule_revisions(project_id,id,label,source_system) values(p.id,i.revision_id,'Imported baseline 01','Schedule import v1');
 insert into public.schedule_nodes(project_id,revision_id,external_id,parent_external_id,name,node_kind,reportable,source_level,source_wbs,planned_start,planned_finish,metadata)
 select p.id,i.revision_id,n->>'externalId',n->>'parentId',n->>'name',n->>'kind',(n->>'reportable')::boolean,n->>'sourceLevel',n->>'sourceWbs',(n->>'plannedStart')::date,(n->>'plannedFinish')::date,n from jsonb_array_elements(i.preview->'nodes') n;
 insert into public.wbs_nodes(project_id,revision_id,id,parent_id,name)
 select n.project_id,n.revision_id,n.id,parent.id,n.name from public.schedule_nodes n left join public.schedule_nodes parent on parent.project_id=n.project_id and parent.revision_id=n.revision_id and parent.external_id=n.parent_external_id where n.project_id=p.id and n.revision_id=i.revision_id;
 for node in select * from public.schedule_nodes where project_id=p.id and revision_id=i.revision_id and reportable loop
  a=gen_random_uuid();
  insert into public.activities(project_id,id,external_id,contractor_id) values(p.id,a,node.external_id,i.contractor_id);
  insert into public.activity_plan_versions(project_id,activity_id,revision_id,wbs_id,name,discipline,location,stage,baseline_start,baseline_finish,planned_start,planned_finish,target_quantity,unit,node_kind,source_metadata)
  values(p.id,a,i.revision_id,node.id,node.name,node.metadata->>'discipline',coalesce(node.metadata->>'location',node.name),'unclassified',node.planned_start,node.planned_finish,node.planned_start,node.planned_finish,(node.metadata->>'quantity')::numeric,node.metadata->>'unit',node.node_kind,node.metadata);
  insert into public.activity_actuals(project_id,activity_id) values(p.id,a);
 end loop;
 update public.projects set active_revision_id=i.revision_id,schedule_version=schedule_version+1 where id=p.id;
 update public.schedule_imports set status='activated',activated_at=now(),activated_by=auth.uid() where id=i.id;
 insert into public.admin_audit(project_id,actor,action,reason,detail) values(p.id,auth.uid()::text,'schedule.import_activated','Planner confirmed initial import mapping',jsonb_build_object('importId',i.id,'previewHash',i.preview_hash,'revisionId',i.revision_id,'nodes',jsonb_array_length(i.preview->'nodes')));
 return i.revision_id;
end $$;
revoke all on function public.activate_schedule_import(uuid,text,uuid) from public,anon;
grant execute on function public.activate_schedule_import(uuid,text,uuid) to authenticated;

create or replace function public.schedule_snapshot(p_project uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('projectId',p.id,'projectName',p.name,'revisionId',p.active_revision_id,'revisionLabel',(select label from public.schedule_revisions where project_id=p.id and id=p.active_revision_id),'policyVersion',p.policy_version,'scheduleVersion',p.schedule_version,
 'nodes',coalesce((select jsonb_agg(jsonb_build_object('externalId',n.external_id,'parentId',n.parent_external_id,'name',n.name,'kind',n.node_kind,'sourceLevel',n.source_level,'sourceWbs',n.source_wbs,'plannedStart',n.planned_start,'plannedFinish',n.planned_finish,'reportable',n.reportable) order by n.metadata->>'order') from public.schedule_nodes n where n.project_id=p.id and n.revision_id=p.active_revision_id),'[]'::jsonb),
 'activities',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'projectId',p.id,'revisionId',v.revision_id,'externalId',a.external_id,'name',v.name,'discipline',v.discipline,'location',v.location,'stage',v.stage,'plannedStart',v.planned_start,'plannedFinish',v.planned_finish,'baselineStart',v.baseline_start,'baselineFinish',v.baseline_finish,'targetQuantity',v.target_quantity,'unit',v.unit,'actualStart',x.actual_start,'actualFinish',x.actual_finish,'acceptedQuantity',x.accepted_quantity,'actualsVersion',x.version,'nodeKind',v.node_kind,'sourceLevel',v.source_metadata->>'sourceLevel','sourceWbs',v.source_metadata->>'sourceWbs','sourceDiscipline',v.source_metadata->>'sourceDiscipline','duration',v.source_metadata->'duration','predecessors',coalesce(v.source_metadata->>'predecessors',''),'calendar',coalesce(v.source_metadata->>'calendar','Source calendar not specified'),'hierarchyPath',coalesce(v.source_metadata->'hierarchyPath','[]'::jsonb),'assignedReporterId',(select reporter_id from public.assignment_versions q where q.project_id=p.id and q.activity_id=a.id order by version desc limit 1)) order by a.external_id)
 from public.activities a join public.activity_plan_versions v on v.project_id=a.project_id and v.activity_id=a.id and v.revision_id=p.active_revision_id join public.activity_actuals x on x.project_id=a.project_id and x.activity_id=a.id where a.project_id=p.id and a.active),'[]'::jsonb)) from public.projects p where p.id=p_project
$$;

-- Imported milestone actuals require the typed occurrence workflow scheduled for Phase 5B.
create function app_private.imported_milestone_gate() returns trigger language plpgsql set search_path='' as $$
begin
 if exists(select 1 from public.activity_plan_versions v join public.projects p on p.id=v.project_id and p.active_revision_id=v.revision_id where v.project_id=new.project_id and v.activity_id=new.activity_id and v.node_kind='milestone') then raise exception 'Milestone occurrence review is not enabled yet' using errcode='22023';end if;
 return new;
end $$;
create trigger milestone_acceptance_gate before insert on public.accepted_events for each row execute function app_private.imported_milestone_gate();
revoke all on function app_private.imported_milestone_gate() from public,anon,authenticated;
