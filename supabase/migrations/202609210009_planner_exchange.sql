-- Phase 6A: immutable planner exchange, accepted history and controlled plan revisions.
create table public.planner_exports (
 id uuid primary key, project_id uuid not null references public.projects(id), actor_id uuid not null,
 request jsonb not null, snapshot jsonb not null, files jsonb not null, manifest jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.planner_exports enable row level security;
create policy planner_export_read on public.planner_exports for select to authenticated using(app_private.is_planner(project_id));
grant select on public.planner_exports to authenticated; grant all on public.planner_exports to service_role;
create trigger immutable_export before update or delete on public.planner_exports for each row execute function app_private.immutable_history();
create index planner_export_project on public.planner_exports(project_id,created_at desc,id);

create function app_private.exchange_csv(p_rows jsonb,p_columns text[]) returns text
language plpgsql immutable set search_path='' as $$
declare result text=''; row jsonb; col text; cell text; line text;
begin
 foreach col in array p_columns loop result=result||case when result='' then '' else ',' end||'"'||replace(col,'"','""')||'"';end loop;
 result=result||E'\r\n';
 for row in select value from jsonb_array_elements(p_rows) loop
  line='';foreach col in array p_columns loop
   cell=coalesce(row->>col,'');
   if replace(cell,chr(65279),'') ~ '^[[:space:]]*[=+@-]' or cell ~ '^[\t\r\n]' then cell=''''||cell;end if;
   line=line||case when line='' then '' else ',' end||'"'||replace(cell,'"','""')||'"';
  end loop;result=result||line||E'\r\n';
 end loop;return result;
end $$;
revoke all on function app_private.exchange_csv(jsonb,text[]) from public,anon,authenticated;

create function app_private.execution_rows(p_project uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
 'eventId',e.id,'claimId',c.id,'reportId',c.report_id,'decisionId',d.id,'activityId',a.id,
 'externalId',a.external_id,'activityName',v.name,'discipline',v.discipline,'location',v.location,
 'revisionId',c.plan_revision_id,'eventKind',e.event_kind,'eventDate',e.facts->>'eventDate',
 'facts',e.facts,'quote',e.facts->>'evidenceQuote','reason',d.reason,'reviewer',m.display_name,
 'reviewerId',d.actor_id,'acceptedAt',e.created_at,'supersedesEventId',e.supersedes_event_id,
 'effective',not exists(select 1 from public.accepted_events newer where newer.supersedes_event_id=e.id),
 'sourceId',rv.context->'sourceEnvelope'->>'sourceRecordId','source',rv.source_text,
 'provenance',rv.context->'sourceEnvelope','matchScore',cm.score,'matchReasons',cm.features,
 'calendar',coalesce(v.source_metadata->>'calendar','Source calendar not specified'),
 'sourceUrl','/planner/review?claim='||c.id::text,
 'auditId',(select au.id from public.admin_audit au where au.project_id=p_project and au.detail->>'eventId'=e.id::text and au.action='claim.accepted' order by au.id limit 1)
 ) order by e.created_at,e.id),'[]'::jsonb)
 from public.accepted_events e join public.activities a on a.project_id=e.project_id and a.id=e.activity_id
 join public.claims c on c.id=e.claim_id join public.review_decisions d on d.id=e.decision_id
 join public.activity_plan_versions v on v.project_id=e.project_id and v.activity_id=e.activity_id and v.revision_id=c.plan_revision_id
 join public.report_versions rv on rv.report_id=c.report_id and rv.version=1
 left join public.project_members m on m.project_id=e.project_id and m.user_id=d.actor_id
 left join public.candidate_matches cm on cm.claim_id=c.id and cm.activity_id=a.id
 where e.project_id=p_project
$$;
revoke all on function app_private.execution_rows(uuid) from public,anon,authenticated;
create function public.execution_history(p_project uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not app_private.is_planner(p_project) then raise exception 'Planner required' using errcode='42501';end if;
 if (select count(*) from public.accepted_events where project_id=p_project)>20000 then raise exception 'History exceeds prototype limit; request a scoped export' using errcode='22023';end if;
 return app_private.execution_rows(p_project);
end $$;
revoke all on function public.execution_history(uuid) from public,anon;
grant execute on function public.execution_history(uuid) to authenticated;

create function public.create_planner_export(p_project uuid,p_command uuid,p_revision uuid,p_version bigint) returns uuid
language plpgsql security definer set search_path='' as $$
declare p public.projects; existing public.planner_exports; request jsonb; snap jsonb; events jsonb; exceptions jsonb;
 rows jsonb; contents text; files jsonb='{}'; manifest jsonb; entry record; captured timestamptz=clock_timestamp();
begin
 select * into p from public.projects where id=p_project for update;
 if not found or not app_private.is_planner(p_project) then raise exception 'Planner required' using errcode='42501';end if;
 if p_command is null or p_revision is null or p_version is null then raise exception 'Export context required' using errcode='22023';end if;
 request=jsonb_build_object('revisionId',p_revision,'scheduleVersion',p_version);
 select * into existing from public.planner_exports where id=p_command;
 if found then
  if existing.project_id<>p_project or existing.actor_id<>auth.uid() or existing.request<>request then raise exception 'COMMAND_ID_REUSED' using errcode='40001';end if;
  return existing.id;
 end if;
 if p.active_revision_id is distinct from p_revision or p.schedule_version<>p_version then raise exception 'STALE_EXPORT' using errcode='40001';end if;
 if (select count(*) from public.claims where project_id=p_project)>20000 or (select count(*) from public.reports where project_id=p_project)>10000 then raise exception 'Export exceeds prototype limit' using errcode='22023';end if;
 -- Approval, worker finalization and revision activation all take this project lock.
 select public.schedule_snapshot(p_project),app_private.execution_rows(p_project),coalesce((
  select jsonb_agg(x.row order by x.row->>'reportId',x.row->>'claimId') from (
   select jsonb_build_object('reportId',c.report_id,'claimId',c.id,'sourceId',rv.context->'sourceEnvelope'->>'sourceRecordId',
    'state',c.state,'eventKind',c.facts->>'kind','eventDate',c.facts->>'eventDate','quote',c.facts->>'evidenceQuote',
    'reason',array_to_string(c.validation_flags,'; '),'revisionId',c.plan_revision_id,'requiresRevalidation',c.plan_revision_id<>p_revision,
    'candidateIds',(select jsonb_agg(a.external_id order by cm.rank) from public.candidate_matches cm join public.activities a on a.id=cm.activity_id where cm.claim_id=c.id)) row
   from public.claims c join public.report_versions rv on rv.report_id=c.report_id and rv.version=1
   where c.project_id=p_project and c.state not in ('accepted','superseded','withdrawn')
   union all
   select jsonb_build_object('reportId',r.id,'sourceId',rv.context->'sourceEnvelope'->>'sourceRecordId','state','processing','reason','No current extracted claim; inspect processing status')
   from public.reports r join public.report_versions rv on rv.report_id=r.id and rv.version=1 where r.project_id=p_project and r.lifecycle='submitted'
   and not exists(select 1 from public.claims c where c.report_id=r.id and c.state not in ('superseded','withdrawn'))
  ) x
 ),'[]') into snap,events,exceptions;
 snap=jsonb_set(snap,'{activities}',(select coalesce(jsonb_agg(a-'reportedProgress'-'assignedReporterId' order by a->>'externalId'),'[]') from jsonb_array_elements(snap->'activities') a));
 select coalesce(jsonb_agg(a||jsonb_build_object(
  'acceptedQuantity',case when exists(select 1 from jsonb_array_elements(events) e where e->>'activityId'=a->>'id' and (e->>'effective')::boolean and e->>'eventKind'='ITEM_PROGRESS') then a->'acceptedQuantity' else 'null'::jsonb end,
  'quantityBasis','Accepted cumulative projection; not an increment',
  'eventIds',(select coalesce(jsonb_agg(e->>'eventId'),'[]') from jsonb_array_elements(events) e where e->>'activityId'=a->>'id' and (e->>'effective')::boolean),
  'elapsedCalendarDays',case when a->>'actualStart' is not null and a->>'actualFinish' is not null then (a->>'actualFinish')::date-(a->>'actualStart')::date else null end,
  'workingDatesInclusive',case when a->>'nodeKind'='milestone' and a->>'milestoneDate' is not null then 0 when a->>'calendar'='Mon–Sat; Sunday off; no holidays' and a->>'actualStart' is not null and a->>'actualFinish' is not null then
   (select count(*) from generate_series((a->>'actualStart')::date,(a->>'actualFinish')::date,interval '1 day') day where extract(isodow from day)<>7) else null end
 ) order by a->>'externalId'),'[]') into rows from jsonb_array_elements(snap->'activities') a;
 files=jsonb_build_object(
  'activities.csv',jsonb_build_object('rows',jsonb_array_length(rows),'content',app_private.exchange_csv(rows,array['externalId','name','discipline','location','nodeKind','revisionId','baselineStart','baselineFinish','plannedStart','plannedFinish','actualStart','actualFinish','milestoneDate','acceptedQuantity','unit','quantityBasis','acceptedPercent','percentBasis','progressAsOf','actualsVersion','calendar','elapsedCalendarDays','workingDatesInclusive','eventIds'])),
  'evidence.csv',jsonb_build_object('rows',jsonb_array_length(events),'content',app_private.exchange_csv(events,array['eventId','claimId','reportId','decisionId','auditId','externalId','revisionId','eventKind','eventDate','effective','supersedesEventId','sourceId','quote','facts','provenance','matchScore','reviewer','reviewerId','acceptedAt','reason','sourceUrl'])),
  'exceptions.csv',jsonb_build_object('rows',jsonb_array_length(exceptions),'content',app_private.exchange_csv(exceptions,array['reportId','claimId','sourceId','state','eventKind','eventDate','quote','reason','revisionId','requiresRevalidation','candidateIds'])),
  'snapshot.json',jsonb_build_object('rows',jsonb_array_length(rows),'content',jsonb_build_object('schedule',snap,'activities',rows,'acceptedEvents',events,'exceptions',exceptions)::text)
 );
 for entry in select * from jsonb_each(files) loop
  files=jsonb_set(files,array[entry.key],entry.value||jsonb_build_object('sha256',encode(extensions.digest(convert_to(entry.value->>'content','UTF8'),'sha256'),'hex'),'bytes',octet_length(convert_to(entry.value->>'content','UTF8'))));
 end loop;
 manifest=jsonb_build_object('schemaVersion','planner-exchange-v1','exportId',p_command,'projectId',p.id,'projectName',p.name,'revisionId',p_revision,'scheduleVersion',p_version,
  'timezone',p.site_timezone,'capturedAt',captured,'asOfDate',(captured at time zone p.site_timezone)::date,'asOfMeaning','Capture date, not a filter on historical or synthetic future work dates',
  'generatedBy',auth.uid(),'compatibility','Generic planner exchange. Native Primavera/P6 import not verified. Download is not external delivery.',
  'semantics',jsonb_build_object('emptyCells','Not recorded / not applicable. Never an instruction to clear a destination field.','zero','A numeric zero is an explicit value only when supported by accepted evidence.','quantity','Cumulative projection, never add to a destination total.','percent','Independent reported value with explicit basis; never inferred from quantity.','corrections','Evidence includes all accepted events; effective=false marks a superseded contribution. Snapshot is current accepted projection.','milestones','Single occurrence with equal actual start/finish; zero working duration.','baseline','Original activity baseline retained; newly added activity uses its first approved planned dates.','csv','UTF-8, CRLF, quoted fields. Formula-like text receives an apostrophe; unmodified evidence remains in snapshot.json.','duration','Elapsed calendar days and inclusive working dates are separate. Working dates only for the stated Mon–Sat calendar; no productivity inference.'),
  'counts',jsonb_build_object('activities',jsonb_array_length(rows),'acceptedEvents',jsonb_array_length(events),'exceptions',jsonb_array_length(exceptions)),
  'files',(select jsonb_object_agg(key,value-'content') from jsonb_each(files)));
 insert into public.planner_exports(id,project_id,actor_id,request,snapshot,files,manifest,created_at) values(p_command,p_project,auth.uid(),request,snap,files,manifest,captured);
 insert into public.admin_audit(project_id,actor,action,reason,detail) values(p_project,auth.uid()::text,'exchange.created','Planner captured an immutable exchange package',jsonb_build_object('exportId',p_command,'revisionId',p_revision,'scheduleVersion',p_version));
 -- Preserve delivery states. A package download is not proof of external delivery.
 return p_command;
end $$;
revoke all on function public.create_planner_export(uuid,uuid,uuid,bigint) from public,anon;
grant execute on function public.create_planner_export(uuid,uuid,uuid,bigint) to authenticated;

create function app_private.schedule_revision_diff(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare i public.schedule_imports;p public.projects;n jsonb;old public.schedule_nodes;a public.activities;v public.activity_plan_versions;
 changes jsonb='[]'; blockers jsonb='[]'; action text; issue text; removed record; result jsonb;
begin
 select * into i from public.schedule_imports where id=p_id;
 select * into p from public.projects where id=i.project_id;
 if i.status<>'ready' or i.files->0->>'profile'='field_corpus' or jsonb_array_length(i.preview->'errors')<>0 or jsonb_array_length(i.preview->'nodes')=0 then raise exception 'IMPORT_NOT_READY' using errcode='22023';end if;
 if p.active_revision_id is null or not exists(select 1 from public.schedule_nodes where project_id=p.id and revision_id=p.active_revision_id) then raise exception 'REVISION_REQUIRES_IMPORTED_PLAN' using errcode='22023';end if;
 if p.active_revision_id is distinct from i.expected_revision then raise exception 'STALE_IMPORT_PREVIEW' using errcode='40001';end if;
 for n in select value from jsonb_array_elements(i.preview->'nodes') order by value->>'externalId' loop
  select * into old from public.schedule_nodes where project_id=p.id and revision_id=p.active_revision_id and external_id=n->>'externalId';
  action=case when old.external_id is null then 'added' when (old.metadata-'refs'-'order') is distinct from (n-'refs'-'order') then 'changed' else 'unchanged' end;
  issue=null;
  select * into a from public.activities where project_id=p.id and external_id=n->>'externalId';
  if (n->>'reportable')::boolean then
   if a.id is not null then
    select * into v from public.activity_plan_versions where project_id=p.id and activity_id=a.id and revision_id=p.active_revision_id;
    if not a.active or v.activity_id is null then issue='Retired IDs cannot be reused. Assign a new Activity ID.';
    elsif a.contractor_id<>i.contractor_id then issue='Existing contractor scope cannot be changed by schedule import.';
    elsif v.name is distinct from n->>'name' or v.discipline is distinct from n->>'discipline' or v.location is distinct from n->>'location' or v.unit is distinct from n->>'unit' or v.node_kind is distinct from n->>'kind' or old.parent_external_id is distinct from n->>'parentId' then issue='Activity identity or scope changed. Use a new ID and retain the original accepted work.';
    elsif exists(select 1 from public.activity_actuals x where x.activity_id=a.id and x.accepted_quantity>coalesce((n->>'quantity')::numeric,0)) then issue='Planned quantity cannot fall below accepted quantity.';
    end if;
   elsif old.external_id is not null then issue='A source context ID cannot become a reporting activity. Use a new ID.';
   elsif exists(select 1 from public.schedule_nodes sn where sn.project_id=p.id and sn.external_id=n->>'externalId') then issue='A retired source ID cannot be reused. Use a new ID.';
   end if;
  elsif a.id is not null and a.active then issue='A reporting activity cannot become a summary or external dependency.';
  end if;
  if issue is not null then blockers=blockers||jsonb_build_array(jsonb_build_object('externalId',n->>'externalId','reason',issue));end if;
  if action<>'unchanged' then changes=changes||jsonb_build_array(jsonb_build_object('externalId',n->>'externalId','action',action,'before',old.metadata-'refs','after',n-'refs'));end if;
 end loop;
 for removed in select sn.* from public.schedule_nodes sn where sn.project_id=p.id and sn.revision_id=p.active_revision_id and not exists(select 1 from jsonb_array_elements(i.preview->'nodes') incoming where incoming->>'externalId'=sn.external_id) order by sn.external_id loop
  changes=changes||jsonb_build_array(jsonb_build_object('externalId',removed.external_id,'action','removed','before',removed.metadata-'refs','after',null));
  if exists(select 1 from public.activities existing_activity join public.accepted_events e on e.activity_id=existing_activity.id where existing_activity.project_id=p.id and existing_activity.external_id=removed.external_id) then
   blockers=blockers||jsonb_build_array(jsonb_build_object('externalId',removed.external_id,'reason','Accepted history exists. Retain this activity in the revision.'));
  end if;
 end loop;
 result=jsonb_build_object('importId',i.id,'previewHash',i.preview_hash,'expectedRevision',p.active_revision_id,'scheduleVersion',p.schedule_version,'policyVersion',p.policy_version,'changes',changes,'blockers',blockers,
  'staleClaims',(select count(*) from public.claims c where c.project_id=p.id and c.state in ('pending','clarification','verification','disputed','unplanned','observed')),
  'rules','Full replacement of source catalogue. Original baselines and accepted facts are retained. Imported actuals are not applied; old proposals require explicit revalidation.');
 return result||jsonb_build_object('diffHash',encode(extensions.digest(result::text,'sha256'),'hex'));
end $$;
revoke all on function app_private.schedule_revision_diff(uuid) from public,anon,authenticated;
create function public.preview_schedule_revision(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.schedule_imports i where i.id=p_id and app_private.is_planner(i.project_id)) then raise exception 'Planner required' using errcode='42501';end if;
 return app_private.schedule_revision_diff(p_id);
end $$;
revoke all on function public.preview_schedule_revision(uuid) from public,anon;
grant execute on function public.preview_schedule_revision(uuid) to authenticated;

create function public.activate_schedule_revision(p_id uuid,p_command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare i public.schedule_imports;p public.projects;diff jsonb;result jsonb;node record;a uuid;v public.activity_plan_versions;
begin
 select * into i from public.schedule_imports where id=p_id;
 if not found or not app_private.is_planner(i.project_id) then raise exception 'Planner required' using errcode='42501';end if;
 select * into p from public.projects where id=i.project_id for update;
 select * into i from public.schedule_imports where id=p_id for update;
 if not app_private.is_planner(p.id) then raise exception 'Membership changed' using errcode='42501';end if;
 p_command=p_command||jsonb_build_object('_resource',p_id,'_operation','activate_schedule_revision');
 result=app_private.replay_followup(p.id,p_command);if result is not null then return result;end if;
 if coalesce(length(trim(p_command->>'reason')),0) not between 1 and 1000 then raise exception 'Revision reason required' using errcode='22023';end if;
 diff=app_private.schedule_revision_diff(p_id);
 if diff->>'diffHash' is distinct from p_command->>'diffHash' then raise exception 'STALE_REVISION_DIFF' using errcode='40001';end if;
 if jsonb_array_length(diff->'blockers')>0 then raise exception 'REVISION_BLOCKED' using errcode='22023';end if;
 if not exists(select 1 from public.project_members where project_id=p.id and contractor_id=i.contractor_id and active) then raise exception 'Contractor scope changed' using errcode='40001';end if;
 insert into public.schedule_revisions(project_id,id,label,source_system) values(p.id,i.revision_id,'Reviewed revision '||(select count(*)+1 from public.schedule_revisions where project_id=p.id),'Planner-reviewed schedule import v1');
 insert into public.schedule_nodes(project_id,revision_id,external_id,parent_external_id,name,node_kind,reportable,source_level,source_wbs,planned_start,planned_finish,metadata)
 select p.id,i.revision_id,n->>'externalId',n->>'parentId',n->>'name',n->>'kind',(n->>'reportable')::boolean,n->>'sourceLevel',n->>'sourceWbs',(n->>'plannedStart')::date,(n->>'plannedFinish')::date,n from jsonb_array_elements(i.preview->'nodes') n;
 insert into public.wbs_nodes(project_id,revision_id,id,parent_id,name)
 select n.project_id,n.revision_id,n.id,parent.id,n.name from public.schedule_nodes n left join public.schedule_nodes parent on parent.project_id=n.project_id and parent.revision_id=n.revision_id and parent.external_id=n.parent_external_id where n.project_id=p.id and n.revision_id=i.revision_id;
 for node in select * from public.schedule_nodes where project_id=p.id and revision_id=i.revision_id and reportable loop
  select id into a from public.activities where project_id=p.id and external_id=node.external_id;
  if a is null then
   a=gen_random_uuid();insert into public.activities(project_id,id,external_id,contractor_id) values(p.id,a,node.external_id,i.contractor_id);
   insert into public.activity_actuals(project_id,activity_id) values(p.id,a);
   v=null;
  else select * into v from public.activity_plan_versions where project_id=p.id and activity_id=a and revision_id=p.active_revision_id;
  end if;
  insert into public.activity_plan_versions(project_id,activity_id,revision_id,wbs_id,name,discipline,location,stage,baseline_start,baseline_finish,planned_start,planned_finish,target_quantity,unit,node_kind,source_metadata)
  values(p.id,a,i.revision_id,node.id,node.name,node.metadata->>'discipline',coalesce(node.metadata->>'location',node.name),coalesce(v.stage,'unclassified'),coalesce(v.baseline_start,node.planned_start),coalesce(v.baseline_finish,node.planned_finish),node.planned_start,node.planned_finish,(node.metadata->>'quantity')::numeric,node.metadata->>'unit',node.node_kind,node.metadata);
 end loop;
 update public.activities retired set active=false where retired.project_id=p.id and retired.active and not exists(select 1 from public.activity_plan_versions new_plan where new_plan.project_id=p.id and new_plan.activity_id=retired.id and new_plan.revision_id=i.revision_id);
 update public.projects set active_revision_id=i.revision_id,schedule_version=schedule_version+1 where id=p.id;
 update public.schedule_imports set status='activated',activated_at=now(),activated_by=auth.uid() where id=i.id;
 result=jsonb_build_object('revisionId',i.revision_id,'scheduleVersion',p.schedule_version+1,'diff',diff);
 return app_private.save_followup(p.id,p_command,result,'schedule.revision_activated');
end $$;
revoke all on function public.activate_schedule_revision(uuid,jsonb) from public,anon;
grant execute on function public.activate_schedule_revision(uuid,jsonb) to authenticated;

create or replace function public.reserve_schedule_import(p_project uuid,p_command uuid,p_contractor uuid,p_files jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare existing public.schedule_imports; f jsonb; fingerprint text;
begin
 perform 1 from public.projects where id=p_project for update;
 if not app_private.is_planner(p_project) then raise exception 'Planner required' using errcode='42501';end if;
 if p_command is null or p_contractor is null or not exists(select 1 from public.project_members where project_id=p_project and contractor_id=p_contractor and active) then raise exception 'Choose a project contractor' using errcode='22023';end if;
 if jsonb_typeof(p_files) is distinct from 'array' or jsonb_array_length(p_files) not between 1 and 2 then raise exception 'One or two source files required' using errcode='22023';end if;
 for f in select value from jsonb_array_elements(p_files) loop
  if (f->>'id')::uuid is null or coalesce(length(f->>'name'),0) not between 1 and 160 or f->>'name' ~ '[\\/]' or f->>'profile' is null or f->>'profile' not in ('gwp_construction','gwp_l3','canonical_csv','field_corpus') or coalesce((f->>'bytes')::integer,0) not between 1 and 5242880 or coalesce(f->>'sha256','') !~ '^[a-f0-9]{64}$' then raise exception 'Invalid file declaration' using errcode='22023';end if;
 end loop;
 if (select count(distinct value->>'id') from jsonb_array_elements(p_files))<>jsonb_array_length(p_files) or (select count(distinct value->>'profile') from jsonb_array_elements(p_files))<>jsonb_array_length(p_files) or (jsonb_array_length(p_files)>1 and exists(select 1 from jsonb_array_elements(p_files) where value->>'profile' in ('canonical_csv','field_corpus'))) then raise exception 'Duplicate or incompatible profiles' using errcode='22023';end if;
 fingerprint=encode(extensions.digest(jsonb_build_object('contractor',p_contractor,'files',p_files)::text,'sha256'),'hex');
 select * into existing from public.schedule_imports where id=p_command;
 if found then
  if existing.project_id<>p_project or existing.author_id<>auth.uid() or existing.input_hash<>fingerprint then raise exception 'COMMAND_ID_REUSED' using errcode='40001';end if;
  return existing.id;
 end if;
 if p_files->0->>'profile'='field_corpus' and not exists(select 1 from public.projects where id=p_project and active_revision_id is not null) then raise exception 'No active plan' using errcode='22023';end if;
 insert into public.schedule_imports(id,project_id,author_id,contractor_id,files,input_hash,expected_revision) values(p_command,p_project,auth.uid(),p_contractor,p_files,fingerprint,(select active_revision_id from public.projects where id=p_project));
 insert into public.admin_audit(project_id,actor,action,reason,detail) values(p_project,auth.uid()::text,'schedule.import_reserved','Source import reserved; activation requires separate review',jsonb_build_object('importId',p_command));
 return p_command;
end $$;
revoke all on function public.reserve_schedule_import(uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function public.reserve_schedule_import(uuid,uuid,uuid,jsonb) to authenticated;
