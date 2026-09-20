-- Phase 5B. Preserve old evidence while adding typed source records and reviewed progress.
alter table public.reports drop constraint reports_source_kind_check;
alter table public.reports add constraint reports_source_kind_check check(source_kind in ('text','spreadsheet'));
alter table public.activity_actuals add column accepted_percent numeric check(accepted_percent between 0 and 100);
alter table public.activity_actuals add column percent_basis text;
alter table public.activity_actuals add column progress_as_of date;
alter table public.activity_actuals add column milestone_date date;
alter table public.accepted_events drop constraint accepted_events_event_kind_check;
alter table public.accepted_events add constraint accepted_events_event_kind_check check(event_kind in ('START','FINISH','ITEM_PROGRESS','PERCENT_PROGRESS','MILESTONE'));
alter table public.claims drop constraint claims_state_check;
alter table public.claims add constraint claims_state_check check(state in ('pending','clarification','verification','disputed','accepted','rejected','unplanned','superseded','withdrawn','observed'));
drop trigger milestone_acceptance_gate on public.accepted_events;
create table public.field_import_rows (
 import_id uuid not null references public.schedule_imports(id),row_key text not null,project_id uuid not null references public.projects(id),
 outcome text not null check(outcome in ('imported','rejected','excluded')),reason text,report_id uuid references public.reports(id),source_record jsonb not null,
 primary key(import_id,row_key)
);
alter table public.field_import_rows enable row level security;
create policy field_manifest_read on public.field_import_rows for select to authenticated using(app_private.is_planner(project_id));
grant select on public.field_import_rows to authenticated;grant all on public.field_import_rows to service_role;
create trigger immutable_field_manifest before update or delete on public.field_import_rows for each row execute function app_private.immutable_history();
create table public.progress_observations (
 id uuid primary key default gen_random_uuid(),project_id uuid not null,claim_id uuid not null,activity_id uuid not null,decision_id uuid not null references public.review_decisions(id),
 event_id uuid references public.accepted_events(id),outcome text not null check(outcome in ('applied','historical','corroborated','context')),facts jsonb not null,created_at timestamptz not null default now(),
 foreign key(project_id,claim_id) references public.claims(project_id,id),foreign key(project_id,activity_id) references public.activities(project_id,id),unique(claim_id,decision_id)
);
alter table public.progress_observations enable row level security;
create policy observation_read on public.progress_observations for select to authenticated using(app_private.can_read_report((select report_id from public.claims where id=claim_id)));
grant select on public.progress_observations to authenticated;grant all on public.progress_observations to service_role;
create trigger immutable_observation before update or delete on public.progress_observations for each row execute function app_private.immutable_history();
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
 if p_files->0->>'profile'<>'field_corpus' and exists(select 1 from public.projects where id=p_project and active_revision_id is not null) then raise exception 'INITIAL_IMPORT_ONLY' using errcode='22023';end if;
 if p_files->0->>'profile'='field_corpus' and not exists(select 1 from public.projects where id=p_project and active_revision_id is not null) then raise exception 'No active plan' using errcode='22023';end if;
 insert into public.schedule_imports(id,project_id,author_id,contractor_id,files,input_hash,expected_revision) values(p_command,p_project,auth.uid(),p_contractor,p_files,fingerprint,(select active_revision_id from public.projects where id=p_project));
 insert into public.admin_audit(project_id,actor,action,reason,detail) values(p_project,auth.uid()::text,'schedule.import_reserved','Initial schedule import',jsonb_build_object('importId',p_command));
 return p_command;
end $$;
revoke all on function public.reserve_schedule_import(uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function public.reserve_schedule_import(uuid,uuid,uuid,jsonb) to authenticated;


create or replace function public.finish_report_job(p_job uuid,p_token uuid,p_revision uuid,p_policy integer,p_claims jsonb) returns void language plpgsql security definer set search_path='' as $$
declare j public.jobs; r public.reports; c jsonb; candidate jsonb; claim_id uuid; ordinal integer=0;parent public.claims;correction uuid;
begin
 perform 1 from public.projects where id=(select source_report.project_id from public.jobs leased_job join public.reports source_report on source_report.id=leased_job.report_id where leased_job.id=p_job) for update;
 select * into j from public.jobs where id=p_job for update;
 if j.status<>'running' or j.lease_token is distinct from p_token or j.lease_until<=now() or j.run_id is null then raise exception 'LEASE_LOST' using errcode='40001'; end if;
 select * into r from public.reports where id=j.report_id;
 if r.lifecycle<>'submitted' then raise exception 'STALE_REPORT' using errcode='40001'; end if;
 if jsonb_typeof(p_claims)<>'array' or jsonb_array_length(p_claims) not between 1 and 100 then raise exception 'Invalid claims'; end if;
 if j.parent_claim_id is not null then
  select * into parent from public.claims where id=j.parent_claim_id for update;
  if parent.state not in ('clarification','accepted') then raise exception 'STALE_REPORT' using errcode='40001';end if;
  if parent.state='accepted' then
   select source_event.id into correction from public.accepted_events source_event where source_event.claim_id=parent.id;
   if exists(select 1 from public.accepted_events where supersedes_event_id=correction) then raise exception 'STALE_CORRECTION' using errcode='40001';end if;
  end if;
 end if;
 for c in select value from jsonb_array_elements(p_claims) loop
  ordinal=ordinal+1;
  insert into public.claims(project_id,report_id,report_version,run_id,ordinal,facts,validation_flags,plan_revision_id,policy_version)
  values(r.project_id,r.id,j.report_version,j.run_id,ordinal,c->'facts',array(select jsonb_array_elements_text(c->'flags')),p_revision,p_policy) returning id into claim_id;
  if j.parent_claim_id is not null then update public.claims set parent_claim_id=parent.id,root_claim_id=coalesce(parent.root_claim_id,parent.id),followup_round=parent.followup_round+case when j.question_id is null then 0 else 1 end,correction_of_event_id=correction where id=claim_id;end if;
  for candidate in select value from jsonb_array_elements(c->'candidates') loop
   insert into public.candidate_matches values(claim_id,r.project_id,(candidate->>'activityId')::uuid,p_revision,(candidate->>'rank')::integer,(candidate->>'score')::numeric,candidate->'features',array(select jsonb_array_elements_text(candidate->'flags')));
  end loop;
 end loop;
 if j.parent_claim_id is not null and parent.state<>'accepted' then update public.claims set state='superseded',version=version+1 where id=parent.id;end if;
 if j.question_id is not null then update public.clarification_requests set status='resolved',version=version+1 where id=j.question_id and status='answered';end if;
 update public.jobs set status='succeeded',lease_token=null,lease_until=null where id=j.id;
 perform public.prepare_report_followups(r.id);
end $$;

create function public.submit_field_import(p_id uuid,p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.schedule_imports;p public.projects;row jsonb;key text;rid uuid;run uuid;result jsonb;selected jsonb;excluded jsonb;total integer=0;ignored integer=0;invalid integer=0;
begin
 select * into i from public.schedule_imports where id=p_id;
 if not found or not app_private.is_planner(i.project_id) then raise exception 'Planner required' using errcode='42501';end if;
 select * into p from public.projects where id=i.project_id for update;
 select * into i from public.schedule_imports where id=p_id for update;
 if not app_private.is_planner(i.project_id) then raise exception 'Membership changed' using errcode='42501';end if;
 p_command=p_command||jsonb_build_object('_resource',p_id,'_operation','submit_field_import');
 result=app_private.replay_followup(p.id,p_command);if result is not null then return result;end if;
 if i.files->0->>'profile'<>'field_corpus' or i.preview->>'kind'<>'field_corpus' or i.status<>'ready' or exists(select 1 from public.field_import_rows where import_id=i.id) then raise exception 'IMPORT_NOT_READY' using errcode='22023';end if;
 if i.preview_hash is distinct from p_command->>'previewHash' or p.active_revision_id is distinct from (p_command->>'expectedRevision')::uuid or p.active_revision_id is distinct from i.expected_revision then raise exception 'STALE_IMPORT_PREVIEW' using errcode='40001';end if;
 selected=p_command->'selected';excluded=p_command->'excluded';
 if jsonb_typeof(selected) is distinct from 'array' or jsonb_typeof(excluded) is distinct from 'object' or jsonb_array_length(selected)>500 or jsonb_array_length(selected)<>(select count(distinct value) from jsonb_array_elements_text(selected)) then raise exception 'Invalid selection' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements_text(selected) x where not exists(select 1 from jsonb_array_elements(i.preview->'rows') r where r->>'key'=x and r->>'status'='ready')) then raise exception 'Invalid source row selected' using errcode='22023';end if;
 for row in select value from jsonb_array_elements(i.preview->'rows') loop
  key=row->>'key';
  if row->>'status'='rejected' then
   insert into public.field_import_rows values(i.id,key,p.id,'rejected',row->>'error',null,row);invalid=invalid+1;
  elsif not selected ? key then
   if coalesce(length(trim(excluded->>key)),0) not between 1 and 500 then raise exception 'Each excluded row needs a reason' using errcode='22023';end if;
   insert into public.field_import_rows values(i.id,key,p.id,'excluded',excluded->>key,null,row);ignored=ignored+1;
  else
   insert into public.reports(project_id,author_id,capture_id,source_kind) values(p.id,auth.uid(),gen_random_uuid(),'spreadsheet') returning id into rid;
   insert into public.report_versions(report_id,version,source_text,work_date,content_hash,context) values(rid,1,row->>'sourceText',(row->'envelope'->>'reportingWorkDate')::date,encode(extensions.digest((row->>'sourceText'),'sha256'),'hex'),jsonb_build_object('sourceEnvelope',row->'envelope','importId',i.id,'fileHash',i.files->0->>'sha256','planRevisionId',p.active_revision_id,'submittedBy',auth.uid(),'contractorId',i.contractor_id));
   run=null;
   if jsonb_typeof(row->'prepared')='array' then
    insert into public.processing_runs(report_id,report_version,pipeline_version,provider,model_id,prompt_hash,input_hash,output,raw_output,usage,latency_ms) values(rid,1,'observations-v2','spreadsheet-profile','field-input-v2','deterministic-profile',i.files->0->>'sha256',jsonb_build_object('claims',row->'prepared','overflow',false),row,'{}',0) returning id into run;
   end if;
   insert into public.jobs(report_id,report_version,pipeline_version,run_id) values(rid,1,'observations-v2',run);
   insert into public.field_import_rows values(i.id,key,p.id,'imported',null,rid,row);total=total+1;
  end if;
 end loop;
 result=jsonb_build_object('importId',i.id,'imported',total,'excluded',ignored,'rejected',invalid,'total',total+ignored+invalid);
 return app_private.save_followup(p.id,p_command,result,'field_import.submitted');
end $$;
revoke all on function public.submit_field_import(uuid,jsonb) from public,anon;
grant execute on function public.submit_field_import(uuid,jsonb) to authenticated;

-- Access is current membership; event authority is the latest recorded allocation covering that date.
create function app_private.reporter_authorized_on(p_project uuid,p_activity uuid,p_author uuid,p_date date) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.project_members m join public.projects p on p.id=m.project_id join public.activities a on a.project_id=p.id
 join public.activity_plan_versions v on v.project_id=p.id and v.activity_id=a.id and v.revision_id=p.active_revision_id
 where p.id=p_project and a.id=p_activity and a.active and m.user_id=p_author and m.active and
 (m.role in ('planner','manager') or (m.contractor_id=a.contractor_id and v.discipline=any(m.discipline_scope) and (cardinality(m.work_front_scope)=0 or v.location=any(m.work_front_scope))
 and (m.role='supervisor' or exists(select 1 from public.assignment_versions x where x.project_id=p.id and x.activity_id=a.id and x.reporter_id=m.user_id and p_date between x.effective_from and x.effective_to and x.version=(select max(y.version) from public.assignment_versions y where y.project_id=p.id and y.activity_id=a.id and p_date between y.effective_from and y.effective_to))))))
$$;
revoke all on function app_private.reporter_authorized_on(uuid,uuid,uuid,date) from public,anon,authenticated;

create function app_private.progress_unit(unit text) returns text language sql immutable set search_path='' as $$
 select case lower(trim(replace(replace(unit,'³','3'),'²','2'))) when 'cum' then 'm3' when 'sqm' then 'm2' when 'rm' then 'm' when 'spools' then 'spool' when 'joints' then 'joint' when 'nos' then 'count' when 'no' then 'count' when 'mt' then 't' else lower(trim(unit)) end
$$;
revoke all on function app_private.progress_unit(text) from public,anon,authenticated;

create function app_private.item_keys(p_items jsonb) returns text[] language sql immutable set search_path='' as $$
 select coalesce(array_agg(distinct regexp_replace(lower(trim(value)), '^([a-z]+)[- ]*0*([0-9]+)$', '\1-\2')),'{}'::text[]) from jsonb_array_elements_text(coalesce(p_items,'[]'));
$$;
revoke all on function app_private.item_keys(jsonb) from public,anon,authenticated;

create function app_private.project_progress(p_project uuid,p_activity uuid,p_facts jsonb,p_correction uuid,p_mode text) returns jsonb language plpgsql stable set search_path='' as $$
declare v public.activity_plan_versions;a public.activity_actuals;kind text=p_facts->>'kind';dt date=(p_facts->>'eventDate')::date;value numeric;basis text;records jsonb;rec jsonb;last_date date;other_date date;last_value numeric;total numeric=0;outcome text='applied';measure text;items jsonb;
begin
 select pv.* into v from public.activity_plan_versions pv join public.projects p on p.id=pv.project_id and p.active_revision_id=pv.revision_id where pv.project_id=p_project and pv.activity_id=p_activity;
 select * into a from public.activity_actuals where project_id=p_project and activity_id=p_activity;
 if a.actual_start is null then raise exception 'MISSING_ACTUAL_START' using errcode='22023';end if;
 if dt is null or dt<a.actual_start or (a.actual_finish is not null and dt>a.actual_finish) then raise exception 'QUANTITY_DATE_OR_STATE_CONFLICT' using errcode='22023';end if;
 if kind='PERCENT_PROGRESS' then
  value=(p_facts->'observation'->'percent'->>'value')::numeric;basis=p_facts->'observation'->'percent'->>'basis';measure='percent';
  if value is null or value not between 0 and 100 or basis is null or basis not in ('physical','duration','unspecified') or p_facts->>'scope'<>'activity' then raise exception 'INVALID_PROGRESS_PERCENT' using errcode='22023';end if;
 else
  value=(p_facts->'quantity'->>'value')::numeric;basis=p_facts->'quantity'->>'mode';measure='quantity';
  if value is null or value<0 or basis is null or basis not in ('delta','cumulative') or v.target_quantity is null or app_private.progress_unit(p_facts->'quantity'->>'unit') is distinct from app_private.progress_unit(v.unit) or coalesce(p_facts->'observation'->>'quantityCoverage','activity_total')<>'activity_total' then raise exception 'QUANTITY_SCOPE_REQUIRES_REVIEW' using errcode='22023';end if;
  if basis='delta' and p_facts->'observation' is not null and p_facts->'observation'<>'null'::jsonb and ((p_facts->'observation'->>'coverageStart')::date is distinct from dt or (p_facts->'observation'->>'coverageEnd')::date is distinct from dt) then raise exception 'COVERAGE_REQUIRED' using errcode='22023';end if;
 end if;
 select coalesce(jsonb_agg(e.facts order by (e.facts->>'eventDate')::date,e.created_at,e.id),'[]') into records from public.accepted_events e where e.project_id=p_project and e.activity_id=p_activity and e.event_kind=kind and e.id is distinct from p_correction and not exists(select 1 from public.accepted_events newer where newer.supersedes_event_id=e.id) and coalesce(e.facts->>'reviewDisposition','applied')<>'corroborated';
 for rec in select x from jsonb_array_elements(records) x loop
  if kind='PERCENT_PROGRESS' and rec->'observation'->'percent'->>'basis' is distinct from basis then raise exception 'PROGRESS_BASIS_CONFLICT' using errcode='22023';end if;
  if (rec->>'eventDate')::date=dt then
   if kind='PERCENT_PROGRESS' or rec->'quantity'->>'mode'=basis then
    if (case when kind='PERCENT_PROGRESS' then (rec->'observation'->'percent'->>'value')::numeric else (rec->'quantity'->>'value')::numeric end)=value then
     if jsonb_array_length(coalesce(p_facts->'observation'->'items','[]'))>0 and jsonb_array_length(coalesce(rec->'observation'->'items','[]'))>0 and not (app_private.item_keys(p_facts->'observation'->'items') @> app_private.item_keys(rec->'observation'->'items') and app_private.item_keys(p_facts->'observation'->'items') <@ app_private.item_keys(rec->'observation'->'items')) then raise exception 'ITEM_COVERAGE_CONFLICT' using errcode='40001';end if;
     if p_mode='corroborate' then return jsonb_build_object('quantity',a.accepted_quantity,'percent',a.accepted_percent,'percentBasis',a.percent_basis,'asOf',a.progress_as_of,'outcome','corroborated');end if;
     raise exception 'POSSIBLE_DUPLICATE_QUANTITY' using errcode='40001';
    else raise exception 'SAME_DAY_PROGRESS_CONFLICT' using errcode='40001';end if;
   end if;
  end if;
  if kind='ITEM_PROGRESS' and basis='delta' and jsonb_array_length(coalesce(p_facts->'observation'->'items','[]'))>0 and (app_private.item_keys(p_facts->'observation'->'items') && app_private.item_keys(rec->'observation'->'items')) then raise exception 'OVERLAPPING_ITEMS' using errcode='40001';end if;
 end loop;
 if p_mode='corroborate' then raise exception 'NO_EQUIVALENT_READING' using errcode='22023';end if;
 select max((e.facts->>'eventDate')::date) into other_date from public.accepted_events e where e.project_id=p_project and e.activity_id=p_activity and e.event_kind in ('ITEM_PROGRESS','PERCENT_PROGRESS') and e.event_kind<>kind and not exists(select 1 from public.accepted_events newer where newer.supersedes_event_id=e.id) and coalesce(e.facts->>'reviewDisposition','applied')<>'corroborated';
 records=records||jsonb_build_array(p_facts);
 if kind='PERCENT_PROGRESS' then
  for rec in select x from jsonb_array_elements(records) x order by (x->>'eventDate')::date loop
   value=(rec->'observation'->'percent'->>'value')::numeric;
   if last_value is not null and value<last_value then raise exception 'QUANTITY_REQUIRES_CORRECTION' using errcode='22023';end if;
   last_value=value;last_date=(rec->>'eventDate')::date;
  end loop;
  return jsonb_build_object('quantity',a.accepted_quantity,'percent',last_value,'percentBasis',basis,'asOf',greatest(last_date,other_date),'outcome',case when dt<last_date then 'historical' else 'applied' end);
 end if;
 for rec in select x from jsonb_array_elements(records) x where x->'quantity'->>'mode'='cumulative' order by (x->>'eventDate')::date loop
  value=(rec->'quantity'->>'value')::numeric;
  if value < coalesce(last_value,0)+(select coalesce(sum((x->'quantity'->>'value')::numeric),0) from jsonb_array_elements(records) x where x->'quantity'->>'mode'='delta' and (last_date is null or (x->>'eventDate')::date>last_date) and (x->>'eventDate')::date<=(rec->>'eventDate')::date) then raise exception 'QUANTITY_REQUIRES_CORRECTION' using errcode='22023';end if;
  last_value=value;last_date=(rec->>'eventDate')::date;
 end loop;
 total=coalesce(last_value,0);
 for rec in select x from jsonb_array_elements(records) x where x->'quantity'->>'mode'='delta' and (last_date is null or (x->>'eventDate')::date>last_date) loop total=total+(rec->'quantity'->>'value')::numeric;end loop;
 if total>v.target_quantity then raise exception 'QUANTITY_REQUIRES_CORRECTION' using errcode='22023';end if;
 if basis='delta' and last_date is not null and dt<=last_date then raise exception 'DAILY_ALREADY_COVERED' using errcode='40001';end if;
 select max((x->>'eventDate')::date) into last_date from jsonb_array_elements(records) x;
 return jsonb_build_object('quantity',total,'percent',a.accepted_percent,'percentBasis',a.percent_basis,'asOf',greatest(last_date,other_date),'outcome',case when dt<last_date then 'historical' else 'applied' end);
end $$;
revoke all on function app_private.project_progress(uuid,uuid,jsonb,uuid,text) from public,anon,authenticated;


create or replace function app_private.review_claim(p_command jsonb,p_preview boolean) returns jsonb language plpgsql security definer set search_path='' as $$
<<acceptance>>
declare c public.claims;r public.reports;p public.projects;a public.activity_actuals;v public.activity_plan_versions;m public.project_members;
 d public.review_decisions;chosen uuid;cmd uuid;action text;reason text;event_date date;kind text;facts jsonb;before_actuals jsonb;result jsonb;decision uuid=gen_random_uuid();event uuid=gen_random_uuid();quantity numeric;mode text;verification public.verification_requests;old_event public.accepted_events;projection jsonb;preview jsonb;preview_hash text;disposition text='applied';
begin
 select * into c from public.claims where id=(p_command->>'claimId')::uuid;
 if not found or not app_private.is_planner(c.project_id) then raise exception 'Review authority required' using errcode='42501'; end if;
 select * into p from public.projects where id=c.project_id for update;
 if not app_private.is_planner(c.project_id) then raise exception 'Membership changed' using errcode='42501'; end if;
 select * into r from public.reports where id=c.report_id for update;
 select * into c from public.claims where id=c.id for update;
 cmd=(p_command->>'commandId')::uuid;action=p_command->>'action';reason=p_command->>'reason';
 if cmd is null or coalesce(length(trim(reason)),0) not between 1 and 1000 or action is null or action not in ('accept','reject','unplanned','observe') then raise exception 'Invalid decision' using errcode='22023'; end if;
 select * into d from public.review_decisions where project_id=p.id and command_id=cmd;
 if found then
  if d.actor_id<>auth.uid() or d.input<>p_command then raise exception 'COMMAND_ID_REUSED' using errcode='40001'; end if;
  return d.result;
 end if;
 if r.lifecycle<>'submitted' or c.report_version is distinct from (p_command->>'expectedReportVersion')::integer
 or c.run_id is distinct from (p_command->>'expectedRunId')::uuid or c.version is distinct from (p_command->>'expectedClaimVersion')::integer or (c.state<>'pending' and not (action in ('reject','unplanned','observe') and c.state in ('clarification','verification','disputed')))
 or p.active_revision_id is distinct from (p_command->>'expectedPlanRevisionId')::uuid or c.plan_revision_id<>p.active_revision_id
 or p.policy_version is distinct from (p_command->>'expectedPolicyVersion')::integer then raise exception 'STALE_REVIEW' using errcode='40001'; end if;
 if action='observe' then
  chosen=(p_command->>'activityId')::uuid;
  if not exists(select 1 from public.activities where project_id=p.id and id=chosen and active) or not exists(select 1 from public.project_members where project_id=p.id and user_id=r.author_id and active) then raise exception 'Access denied' using errcode='42501';end if;
  result=jsonb_build_object('state','observed','claimId',c.id,'activityId',chosen,'scheduleVersion',p.schedule_version);
  insert into public.review_decisions values(decision,p.id,cmd,c.id,auth.uid(),'observe',p_command,result,reason,now());
  insert into public.progress_observations(project_id,claim_id,activity_id,decision_id,outcome,facts) values(p.id,c.id,chosen,decision,'context',c.facts);
  update public.claims set state='observed',version=version+1 where id=c.id;
  update public.clarification_requests set status='cancelled',version=version+1 where claim_id=c.id and status in ('open','answered');
  insert into public.admin_audit(project_id,actor,action,reason,detail) values(p.id,auth.uid()::text,'claim.observed',reason,result);
  return result;
 end if;
 if action<>'accept' then
  result=jsonb_build_object('state',case when action='reject' then 'rejected' else 'unplanned' end,'claimId',c.id,'scheduleVersion',p.schedule_version);
  insert into public.review_decisions values(decision,p.id,cmd,c.id,auth.uid(),action,p_command,result,reason,now());
  update public.claims set state=result->>'state',version=version+1 where id=c.id;
  insert into public.admin_audit(project_id,actor,action,reason,detail) values(p.id,auth.uid()::text,'claim.'||(result->>'state'),reason,jsonb_build_object('claimId',c.id,'decisionId',decision));
  return result;
 end if;
 chosen=(p_command->>'activityId')::uuid;
 select * into v from public.activity_plan_versions where project_id=p.id and activity_id=chosen and revision_id=p.active_revision_id;
 if not found or not exists(select 1 from public.activities where project_id=p.id and id=chosen and active) then raise exception 'Invalid activity' using errcode='22023'; end if;
 if exists(select 1 from public.report_versions rv join public.activities ac on ac.id=chosen where rv.report_id=r.id and rv.version=c.report_version and rv.context->>'contractorId' is not null and (rv.context->>'contractorId')::uuid is distinct from ac.contractor_id) then raise exception 'SOURCE_CONTRACTOR_MISMATCH' using errcode='22023';end if;
 if not exists(select 1 from public.candidate_matches where claim_id=c.id and activity_id=chosen and cardinality(mismatch_flags)=0) then raise exception 'MATCH_REQUIRES_CLARIFICATION' using errcode='22023'; end if;
 if exists(select 1 from unnest(c.validation_flags) f where f<>'Work date missing' or p_command->>'correctedDate' is null) then raise exception 'MISSING_OR_UNRESOLVED_FACTS' using errcode='22023'; end if;
 select * into m from public.project_members where project_id=p.id and user_id=r.author_id and active;
 if not found then raise exception 'Reporter membership revoked' using errcode='42501'; end if;
 -- Assignment is context, never proof of work. A mismatch stays blocked for Phase 4 verification.
 if exists(select 1 from public.clarification_requests where claim_id=c.id and status in ('open','answered')) then raise exception 'OPEN_QUESTION' using errcode='22023';end if;
 select * into verification from public.verification_requests where claim_id=c.id and status not in ('superseded','cancelled');
 if found or not app_private.reporter_authorized_on(p.id,chosen,r.author_id,coalesce((p_command->>'correctedDate')::date,(c.facts->>'eventDate')::date)) then
  if verification.id is null or verification.status<>'confirmed' or not verification.allocation_confirmed or not verification.work_confirmed
  or verification.activity_id<>chosen or verification.claim_version<>c.version or verification.report_version<>c.report_version or verification.plan_revision_id<>p.active_revision_id or verification.policy_version<>p.policy_version
  or verification.facts_hash<>encode(extensions.digest(c.facts::text,'sha256'),'hex')
  or verification.assignment_version is distinct from (select max(version) from public.assignment_versions where project_id=p.id and activity_id=chosen)
  or not app_private.verifier_eligible(p.id,chosen,verification.verifier_id,r.author_id)
  or verification.id is distinct from (p_command->>'expectedVerificationId')::uuid or verification.version is distinct from (p_command->>'expectedVerificationVersion')::integer
  or (p_command->>'correctedDate' is not null and p_command->>'correctedDate' is distinct from c.facts->>'eventDate')
  then raise exception 'VERIFICATION_REQUIRED_OR_STALE' using errcode='22023';end if;
 end if;
 facts=c.facts;kind=facts->>'kind';
 if kind is null or kind not in ('START','FINISH','ITEM_PROGRESS','PERCENT_PROGRESS','MILESTONE') then raise exception 'NON_EXECUTION_CLAIM' using errcode='22023'; end if;
 if p_command->>'correctedDate' is not null then facts=jsonb_set(jsonb_set(facts,'{eventDate}',p_command->'correctedDate'),'{dateOrigin}','"planner_corrected"'); end if;
 event_date=(facts->>'eventDate')::date;
 if event_date is null then raise exception 'MISSING_EVENT_DATE' using errcode='22023'; end if;
 select * into a from public.activity_actuals where project_id=p.id and activity_id=chosen for update;
 if not found or a.version is distinct from (p_command->>'expectedActualsVersion')::integer then raise exception 'STALE_ACTUALS' using errcode='40001'; end if;
 before_actuals=to_jsonb(a);
 if c.correction_of_event_id is not null then
  select * into old_event from public.accepted_events where id=c.correction_of_event_id;
  if not found or old_event.project_id<>p.id or old_event.activity_id<>chosen or old_event.event_kind<>kind or kind not in ('START','FINISH','ITEM_PROGRESS','PERCENT_PROGRESS') or exists(select 1 from public.accepted_events where supersedes_event_id=old_event.id) then raise exception 'STALE_CORRECTION' using errcode='40001';end if;
  if kind in ('ITEM_PROGRESS','PERCENT_PROGRESS') then
   projection=app_private.project_progress(p.id,chosen,facts,old_event.id,coalesce(p_command->>'reconciliation','apply'));
  elsif kind='START' then
   if a.actual_start is distinct from (old_event.facts->>'eventDate')::date or (a.actual_finish is not null and event_date>a.actual_finish) or exists(select 1 from public.accepted_events e where e.activity_id=chosen and e.event_kind in ('ITEM_PROGRESS','PERCENT_PROGRESS') and not exists(select 1 from public.accepted_events newer where newer.supersedes_event_id=e.id) and (e.facts->>'eventDate')::date<event_date) then raise exception 'CORRECTION_DATE_CONFLICT' using errcode='22023';end if;
   a.actual_start=event_date;
  else
   if a.actual_finish is distinct from (old_event.facts->>'eventDate')::date or a.actual_start is null or event_date<a.actual_start or exists(select 1 from public.accepted_events e where e.activity_id=chosen and e.event_kind in ('ITEM_PROGRESS','PERCENT_PROGRESS') and not exists(select 1 from public.accepted_events newer where newer.supersedes_event_id=e.id) and (e.facts->>'eventDate')::date>event_date) then raise exception 'CORRECTION_DATE_CONFLICT' using errcode='22023';end if;
   a.actual_finish=event_date;
  end if;
 elsif kind='MILESTONE' then
  if v.node_kind<>'milestone' or a.milestone_date is not null then raise exception 'INVALID_MILESTONE_OCCURRENCE' using errcode='22023';end if;
  a.milestone_date=event_date;a.actual_start=event_date;a.actual_finish=event_date;
 elsif v.node_kind='milestone' then raise exception 'MILESTONE_KIND_REQUIRED' using errcode='22023';
 elsif kind='START' then
  if facts->>'scope' is distinct from 'activity' then raise exception 'PARTIAL_SCOPE' using errcode='22023'; end if;
  if a.actual_start is not null then raise exception 'EXISTING_START_REQUIRES_RECONCILIATION' using errcode='40001'; end if;
  a.actual_start=event_date;
 elsif kind='FINISH' then
  if facts->>'scope' is distinct from 'activity' or (facts->>'fullScope')::boolean is distinct from true then raise exception 'PARTIAL_SCOPE_CANNOT_FINISH' using errcode='22023'; end if;
  if a.actual_start is null then raise exception 'MISSING_ACTUAL_START' using errcode='22023'; end if;
  if a.actual_finish is not null then raise exception 'EXISTING_FINISH_REQUIRES_RECONCILIATION' using errcode='40001'; end if;
  if event_date<a.actual_start then raise exception 'FINISH_BEFORE_START' using errcode='22023'; end if;
  if event_date<a.progress_as_of then raise exception 'FINISH_BEFORE_PROGRESS' using errcode='22023';end if;
  if facts->'quantity'<>'null'::jsonb and coalesce(facts->'observation'->>'quantityCoverage','activity_total')<>'supporting' and (app_private.progress_unit(facts->'quantity'->>'unit') is distinct from app_private.progress_unit(v.unit) or (facts->'quantity'->>'value')::numeric<v.target_quantity) then raise exception 'INCOMPLETE_QUANTITY' using errcode='22023'; end if;
  if v.name ~* 'PCC.*reinforcement.*concret' and not (facts->>'evidenceQuote' ~* '(PCC|blinding)' and facts->>'evidenceQuote' ~* '(rebar|reinforcement|steel fixing)' and facts->>'evidenceQuote' ~* '(concret|pour)') then raise exception 'COMPOUND_SCOPE_INCOMPLETE' using errcode='22023';end if;
  a.actual_finish=event_date;
 else
  projection=app_private.project_progress(p.id,chosen,facts,null,coalesce(p_command->>'reconciliation','apply'));
 end if;
 if projection is not null then
  a.accepted_quantity=(projection->>'quantity')::numeric;a.accepted_percent=(projection->>'percent')::numeric;a.percent_basis=projection->>'percentBasis';a.progress_as_of=(projection->>'asOf')::date;disposition=projection->>'outcome';
  facts=facts||jsonb_build_object('reviewDisposition',disposition,'normalizedUnit',app_private.progress_unit(facts->'quantity'->>'unit'));
 end if;
 a.version=a.version+1;
 preview=jsonb_build_object('activityId',chosen,'activityName',v.name,'hierarchy',coalesce(v.source_metadata->'hierarchyPath','[]'),'before',before_actuals,'after',to_jsonb(a),'facts',facts,'disposition',disposition,'exportFields',jsonb_build_object('actualStart',a.actual_start,'actualFinish',a.actual_finish,'acceptedQuantity',a.accepted_quantity,'acceptedPercent',a.accepted_percent,'percentBasis',a.percent_basis,'milestoneDate',a.milestone_date));
 preview_hash=encode(extensions.digest(jsonb_build_object('command',p_command-'previewHash','preview',preview)::text,'sha256'),'hex');
 if p_preview then return preview||jsonb_build_object('previewHash',preview_hash);end if;
 if p_command ? 'previewHash' and p_command->>'previewHash' is distinct from preview_hash then raise exception 'STALE_CHANGE_PREVIEW' using errcode='40001';end if;
 if facts->'observation'->>'version'='2' and not p_command ? 'previewHash' then raise exception 'CHANGE_PREVIEW_REQUIRED' using errcode='22023';end if;
 result=jsonb_build_object('state','accepted','claimId',c.id,'eventId',event,'activityId',chosen,'actualsVersion',a.version,'scheduleVersion',p.schedule_version+1,'deliveryState','pending');
 insert into public.review_decisions values(decision,p.id,cmd,c.id,auth.uid(),'accept',p_command,result,reason,now());
 insert into public.accepted_events(id,project_id,claim_id,decision_id,activity_id,event_kind,facts,created_at,supersedes_event_id) values(event,p.id,c.id,decision,chosen,kind,facts,now(),c.correction_of_event_id);
 update public.activity_actuals set actual_start=a.actual_start,actual_finish=a.actual_finish,accepted_quantity=a.accepted_quantity,accepted_percent=a.accepted_percent,percent_basis=a.percent_basis,progress_as_of=a.progress_as_of,milestone_date=a.milestone_date,version=a.version where project_id=p.id and activity_id=chosen;
 update public.claims set state='accepted',version=version+1 where id=c.id;
 update public.projects set schedule_version=schedule_version+1 where id=p.id;
 insert into public.admin_audit(project_id,actor,action,reason,detail) values(p.id,auth.uid()::text,'claim.accepted',reason,jsonb_build_object('claimId',c.id,'eventId',event,'decisionId',decision,'before',before_actuals,'after',to_jsonb(a)));
 if kind in ('ITEM_PROGRESS','PERCENT_PROGRESS') then insert into public.progress_observations(project_id,claim_id,activity_id,decision_id,event_id,outcome,facts) values(p.id,c.id,chosen,decision,event,disposition,facts);end if;
 if true then
  insert into public.delivery_outbox(project_id,event_id,activity_id,patch,expected_source) values(p.id,event,chosen,jsonb_build_object('actualStart',a.actual_start,'actualFinish',a.actual_finish,'actualsVersion',a.version,'acceptedQuantity',a.accepted_quantity,'acceptedPercent',a.accepted_percent,'percentBasis',a.percent_basis,'milestoneDate',a.milestone_date),jsonb_build_object('actualStart',before_actuals->'actual_start','actualFinish',before_actuals->'actual_finish'));
 end if;
 return result;
end $$;

revoke all on function app_private.review_claim(jsonb,boolean) from public,anon,authenticated;
create or replace function public.decide_claim(p_command jsonb) returns jsonb language sql security definer set search_path='' as $$select app_private.review_claim(p_command,false)$$;
create function public.preview_claim(p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$begin if p_command->>'action' is distinct from 'accept' then raise exception 'Preview requires acceptance command' using errcode='22023';end if;return app_private.review_claim(p_command,true);end$$;
revoke all on function public.preview_claim(jsonb) from public,anon;grant execute on function public.preview_claim(jsonb) to authenticated;

create or replace function public.schedule_snapshot(p_project uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('projectId',p.id,'projectName',p.name,'revisionId',p.active_revision_id,'revisionLabel',(select label from public.schedule_revisions where project_id=p.id and id=p.active_revision_id),'policyVersion',p.policy_version,'scheduleVersion',p.schedule_version,
 'nodes',coalesce((select jsonb_agg(jsonb_build_object('externalId',n.external_id,'parentId',n.parent_external_id,'name',n.name,'kind',n.node_kind,'sourceLevel',n.source_level,'sourceWbs',n.source_wbs,'plannedStart',n.planned_start,'plannedFinish',n.planned_finish,'reportable',n.reportable) order by n.metadata->>'order') from public.schedule_nodes n where n.project_id=p.id and n.revision_id=p.active_revision_id),'[]'::jsonb),
 'activities',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'projectId',p.id,'revisionId',v.revision_id,'externalId',a.external_id,'name',v.name,'discipline',v.discipline,'location',v.location,'stage',v.stage,'plannedStart',v.planned_start,'plannedFinish',v.planned_finish,'baselineStart',v.baseline_start,'baselineFinish',v.baseline_finish,'targetQuantity',v.target_quantity,'unit',v.unit,'actualStart',x.actual_start,'actualFinish',x.actual_finish,'acceptedQuantity',x.accepted_quantity,'actualsVersion',x.version,'reportedProgress',exists(select 1 from public.progress_observations po join public.claims oc on oc.id=po.claim_id where po.project_id=p.id and po.activity_id=a.id and po.outcome='context' and oc.state='observed' and po.facts->>'kind' in ('ITEM_PROGRESS','PERCENT_PROGRESS','FINISH')) or exists(select 1 from public.claims pc join public.candidate_matches cm on cm.claim_id=pc.id where pc.project_id=p.id and cm.project_id=p.id and cm.activity_id=a.id and cm.rank=1 and cardinality(cm.mismatch_flags)=0 and cardinality(pc.validation_flags)=0 and pc.state='pending' and pc.facts->>'kind' in ('ITEM_PROGRESS','PERCENT_PROGRESS')),'acceptedPercent',x.accepted_percent,'percentBasis',x.percent_basis,'progressAsOf',x.progress_as_of,'milestoneDate',x.milestone_date,'nodeKind',v.node_kind,'sourceLevel',v.source_metadata->>'sourceLevel','sourceWbs',v.source_metadata->>'sourceWbs','sourceDiscipline',v.source_metadata->>'sourceDiscipline','duration',v.source_metadata->'duration','predecessors',coalesce(v.source_metadata->>'predecessors',''),'calendar',coalesce(v.source_metadata->>'calendar','Source calendar not specified'),'hierarchyPath',coalesce(v.source_metadata->'hierarchyPath','[]'::jsonb),'assignedReporterId',(select reporter_id from public.assignment_versions q where q.project_id=p.id and q.activity_id=a.id order by version desc limit 1)) order by a.external_id)
 from public.activities a join public.activity_plan_versions v on v.project_id=a.project_id and v.activity_id=a.id and v.revision_id=p.active_revision_id join public.activity_actuals x on x.project_id=a.project_id and x.activity_id=a.id where a.project_id=p.id and a.active),'[]'::jsonb)) from public.projects p where p.id=p_project
$$;


create or replace function public.amend_report(p_report uuid,p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.reports;c public.claims;result jsonb;facts jsonb;event_id uuid;
begin
 p_command=p_command||jsonb_build_object('_resource',p_report,'_operation','amend_report');
 select * into r from public.reports where id=p_report;perform 1 from public.projects where id=r.project_id for update;
 select * into r from public.reports where id=p_report for update;
 if not app_private.is_member(r.project_id) or r.author_id<>auth.uid() then raise exception 'Only the reporter can amend' using errcode='42501';end if;
 result=app_private.replay_followup(r.project_id,p_command);if result is not null then return result;end if;
 select * into c from public.claims where id=(p_command->>'claimId')::uuid and report_id=r.id for update;
 if not found or r.lifecycle<>'submitted' or r.current_version is distinct from (p_command->>'expectedReportVersion')::integer or c.version is distinct from (p_command->>'expectedClaimVersion')::integer or c.state in ('superseded','withdrawn','rejected','unplanned') then raise exception 'STALE_REVIEW' using errcode='40001';end if;
 if coalesce(length(trim(p_command->>'reason')),0) not between 1 and 1000 or p_command->>'eventDate' is null then raise exception 'Date and reason required' using errcode='22023';end if;
 perform (p_command->>'eventDate')::date;
 if c.state='accepted' and c.facts->>'kind' not in ('START','FINISH','ITEM_PROGRESS','PERCENT_PROGRESS') then raise exception 'Quantity correction needs item reconciliation' using errcode='22023';end if;
 if exists(select 1 from public.jobs where parent_claim_id=c.id and status in ('queued','running','retry_wait')) then raise exception 'AMENDMENT_PROCESSING' using errcode='40001';end if;
 facts=c.facts||jsonb_build_object('eventDate',p_command->>'eventDate','dateOrigin','reporter_confirmed');
 if p_command ? 'quantityValue' then
  if facts->>'kind'<>'ITEM_PROGRESS' or (p_command->>'quantityValue')::numeric<0 then raise exception 'Invalid quantity correction' using errcode='22023';end if;
  facts=jsonb_set(facts,'{quantity,value}',p_command->'quantityValue');
 end if;
 if p_command ? 'percentValue' then
  if facts->>'kind'<>'PERCENT_PROGRESS' or (p_command->>'percentValue')::numeric not between 0 and 100 then raise exception 'Invalid percentage correction' using errcode='22023';end if;
  facts=jsonb_set(facts,'{observation,percent,value}',p_command->'percentValue');
 end if;
 if facts->'observation'->>'version'='2' then facts=jsonb_set(jsonb_set(jsonb_set(jsonb_set(facts,'{observation,coverageStart}',p_command->'eventDate'),'{observation,coverageEnd}',p_command->'eventDate'),'{observation,dateBasis}','"confirmed"'),'{observation,dateEvidence}',p_command->'reason');end if;
 update public.clarification_requests set status='superseded',version=version+1 where claim_id=c.id and status='open';
 result=app_private.queue_reply(c.id,jsonb_build_array(facts),'Correct work date: '||(p_command->>'eventDate')||'. Reason: '||(p_command->>'reason'));
 return app_private.save_followup(r.project_id,p_command,result,'report.date_amended');
end $$;


create or replace function app_private.ask_claim(p_claim uuid,p_reason text default null,p_automatic boolean default true) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.claims;r public.reports;why text;qid uuid;opts jsonb;question text;best uuid;
begin
 select * into c from public.claims where id=p_claim for update;select * into r from public.reports where id=c.report_id;
 if c.state not in ('pending','clarification','disputed','verification') or r.lifecycle<>'submitted' then return null;end if;
 select id into qid from public.clarification_requests where claim_id=c.id and status='open';if found then return qid;end if;
 if p_automatic and c.followup_round>=2 then update public.claims set manual_review=true where id=c.id;return null;end if;
 select activity_id into best from public.candidate_matches where claim_id=c.id and cardinality(mismatch_flags)=0 order by rank limit 1;
 why=coalesce(p_reason,case
 when 'Work location missing'=any(c.validation_flags) or best is null then 'location'
 when 'Work date missing'=any(c.validation_flags) then 'date'
 when 'Activity or item scope unclear'=any(c.validation_flags) or 'Partial scope cannot finish an activity'=any(c.validation_flags) then 'scope'
 when not app_private.reporter_authorized_on(c.project_id,best,r.author_id,(c.facts->>'eventDate')::date) and not exists(select 1 from public.clarification_responses a join public.clarification_requests q on q.id=a.request_id where q.reason_code='assignment' and q.claim_id=coalesce(c.parent_claim_id,c.id) and a.input->>'answer'='yes') then 'assignment'
 when cardinality(c.validation_flags)>0 then 'detail' else null end);
 if why is null then return null;end if;
 question=case why when 'location' then 'Where did you do this work? Choose the area, or type its name.' when 'date' then 'Which day did this work happen?' when 'scope' then 'Is the whole activity finished, with nothing left to do?' when 'assignment' then 'You reported work outside your assigned task. Is the location correct? Who asked you to work there?' else 'What still needs to be checked or finished? Please explain.' end;
 select coalesce(jsonb_agg(jsonb_build_object('activityId',v.activity_id,'label',v.location||' — '||v.name) order by a.external_id),'[]') into opts
 from public.activity_plan_versions v join public.projects p on p.id=v.project_id and p.active_revision_id=v.revision_id join public.activities a on a.project_id=p.id and a.id=v.activity_id
 where v.project_id=c.project_id and a.active and app_private.reporter_assigned(c.project_id,a.id,r.author_id)
 and (c.facts->>'discipline' is null or v.discipline=c.facts->>'discipline')
 and (c.facts->>'stage' is null or lower(replace(v.stage,'_',' '))=lower(replace(c.facts->>'stage','_',' ')));
 update public.claims set state='clarification',version=version+1 where id=c.id returning * into c;
 insert into public.clarification_requests(project_id,claim_id,report_id,claim_version,report_version,reason_code,question_text,options,automatic)
 values(c.project_id,c.id,r.id,c.version,c.report_version,why,question,case when why='location' then opts else '[]' end,p_automatic) returning id into qid;
 return qid;
end $$;
create function public.rematch_claim(p_claim uuid,p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.claims;r public.reports;p public.projects;v public.activity_plan_versions;new_claim uuid;run uuid;result jsonb;flags text[];prior public.candidate_matches;
begin
 select * into c from public.claims where id=p_claim;
 if not found or not app_private.is_planner(c.project_id) then raise exception 'Planner required' using errcode='42501';end if;
 select * into p from public.projects where id=c.project_id for update;select * into c from public.claims where id=p_claim for update;select * into r from public.reports where id=c.report_id;
 if not app_private.is_planner(p.id) then raise exception 'Membership changed' using errcode='42501';end if;
 p_command=p_command||jsonb_build_object('_resource',p_claim,'_operation','rematch_claim');result=app_private.replay_followup(p.id,p_command);if result is not null then return result;end if;
 if c.version is distinct from (p_command->>'expectedClaimVersion')::integer or p.active_revision_id is distinct from (p_command->>'expectedRevision')::uuid or c.state not in ('pending','clarification','unplanned','observed') or r.lifecycle<>'submitted' then raise exception 'STALE_REVIEW' using errcode='40001';end if;
 if coalesce(length(trim(p_command->>'reason')),0) not between 1 and 1000 then raise exception 'Reason required' using errcode='22023';end if;
 select * into v from public.activity_plan_versions where project_id=p.id and activity_id=(p_command->>'activityId')::uuid and revision_id=p.active_revision_id;
 if not found or not exists(select 1 from public.activities where id=v.activity_id and project_id=p.id and active) then raise exception 'Invalid reporting leaf' using errcode='22023';end if;
 if exists(select 1 from public.verification_requests where claim_id=c.id and status not in ('cancelled','superseded')) then raise exception 'VERIFICATION_REQUIRED_OR_STALE' using errcode='22023';end if;
 select array_agg(x) into flags from unnest(c.validation_flags) x where x not in ('No matching activity','Work location missing');
 select * into prior from public.candidate_matches where claim_id=c.id and activity_id=v.activity_id;
 -- A rematch is an explicit planner mapping, not rewritten field evidence or a new completion assertion.
 insert into public.processing_runs(report_id,report_version,pipeline_version,provider,model_id,prompt_hash,input_hash,output,raw_output,usage,latency_ms) values(r.id,c.report_version,'rematch:'||(p_command->>'commandId'),'planner-rematch','manual-mapping-v1','none',encode(extensions.digest(c.facts::text,'sha256'),'hex'),jsonb_build_object('claims',jsonb_build_array(c.facts)),p_command,'{}',0) returning id into run;
 insert into public.claims(project_id,report_id,report_version,run_id,ordinal,facts,validation_flags,state,plan_revision_id,policy_version,parent_claim_id,root_claim_id,followup_round,manual_review) values(p.id,r.id,c.report_version,run,1,c.facts,coalesce(flags,'{}'),'pending',p.active_revision_id,p.policy_version,c.id,coalesce(c.root_claim_id,c.id),c.followup_round,true) returning id into new_claim;
 insert into public.candidate_matches values(new_claim,p.id,v.activity_id,p.active_revision_id,1,0,jsonb_build_object('plannerMapping',1),case when 'Compound planned scope is not fully confirmed'=any(prior.mismatch_flags) then array['Compound planned scope is not fully confirmed'] else '{}' end);
 update public.claims set state='superseded',version=version+1 where id=c.id;
 update public.clarification_requests set status='superseded',version=version+1 where claim_id=c.id and status in ('open','answered');
 result=jsonb_build_object('claimId',new_claim,'previousClaimId',c.id,'state','pending');return app_private.save_followup(p.id,p_command,result,'claim.rematched');
end $$;
revoke all on function public.rematch_claim(uuid,jsonb) from public,anon;
grant execute on function public.rematch_claim(uuid,jsonb) to authenticated;

create function public.reprocess_report(p_report uuid,p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.reports;v public.report_versions;result jsonb;n integer;
begin
 p_command=p_command||jsonb_build_object('_resource',p_report,'_operation','reprocess_report');
 select * into r from public.reports where id=p_report;
 if not found or not app_private.is_planner(r.project_id) then raise exception 'Planner required' using errcode='42501';end if;
 perform 1 from public.projects where id=r.project_id for update;
 if not app_private.is_planner(r.project_id) then raise exception 'Planner required' using errcode='42501';end if;
 select * into r from public.reports where id=p_report for update;
 result=app_private.replay_followup(r.project_id,p_command);if result is not null then return result;end if;
 if r.lifecycle<>'submitted' or r.current_version is distinct from (p_command->>'expectedReportVersion')::integer or coalesce(length(trim(p_command->>'reason')),0) not between 1 and 1000 then raise exception 'STALE_REVIEW' using errcode='40001';end if;
 if exists(select 1 from public.accepted_events e join public.claims c on c.id=e.claim_id where c.report_id=r.id) then raise exception 'REPORT_HAS_ACCEPTED_EVENTS' using errcode='22023';end if;
 if exists(select 1 from public.jobs where report_id=r.id and status in ('queued','running','retry_wait')) then raise exception 'AMENDMENT_PROCESSING' using errcode='40001';end if;
 select * into v from public.report_versions where report_id=r.id and version=r.current_version;
 if v.context->>'submissionMode'='structured_reply' or (v.context->'sourceEnvelope'->>'sheet' is not null and v.context->'sourceEnvelope'->>'sheet'<>'Text_Reports') then raise exception 'TEXT_SOURCE_REQUIRED' using errcode='22023';end if;
 n=r.current_version+1;
 insert into public.report_versions(report_id,version,source_text,work_date,selected_activity_id,content_hash,context) values(r.id,n,v.source_text,v.work_date,v.selected_activity_id,v.content_hash,v.context||jsonb_build_object('reprocessedFrom',v.version,'reprocessingReason',p_command->>'reason'));
 update public.reports set current_version=n where id=r.id;
 update public.claims set state='superseded',version=version+1 where report_id=r.id and state not in ('superseded','withdrawn');
 update public.clarification_requests set status='superseded',version=version+1 where report_id=r.id and status in ('open','answered');
 update public.verification_requests set status='superseded',version=version+1 where claim_id in(select id from public.claims where report_id=r.id) and status not in ('superseded','cancelled');
 insert into public.jobs(report_id,report_version,pipeline_version) values(r.id,n,'observations-v2');
 result=jsonb_build_object('reportId',r.id,'reportVersion',n,'processing','queued');
 return app_private.save_followup(r.project_id,p_command,result,'report.reprocessed');
end $$;
revoke all on function public.reprocess_report(uuid,jsonb) from public,anon;
grant execute on function public.reprocess_report(uuid,jsonb) to authenticated;


create or replace function app_private.queue_reply(p_claim uuid,p_facts jsonb,p_text text,p_question uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.claims;r public.reports;source text;run uuid;facts jsonb;out_claims jsonb='[]';new_version integer;
begin
 select * into c from public.claims where id=p_claim for update;select * into r from public.reports where id=c.report_id for update;
 new_version=r.current_version+1;source=coalesce(c.facts->>'evidenceQuote','')||E'\nRecorded clarification: '||p_text;
 for facts in select value from jsonb_array_elements(p_facts) loop out_claims=out_claims||jsonb_build_array(jsonb_set(facts,'{evidenceQuote}',to_jsonb(source)));end loop;
 insert into public.report_versions(report_id,version,source_text,work_date,selected_activity_id,content_hash,context)
 values(r.id,new_version,source,null,null,encode(extensions.digest(source,'sha256'),'hex'),coalesce((select rv.context from public.report_versions rv where rv.report_id=c.report_id and rv.version=c.report_version),'{}'::jsonb)||jsonb_build_object('parentClaimId',c.id,'originalVersion',c.report_version,'questionId',p_question,'confirmedBy',auth.uid(),'submissionMode','structured_reply'));
 update public.reports set current_version=new_version where id=r.id;
 insert into public.processing_runs(report_id,report_version,pipeline_version,provider,model_id,prompt_hash,input_hash,output,raw_output,usage,latency_ms)
 values(r.id,new_version,'followup-v1','structured-input','validated-form-v1','structured-reply-v1',encode(extensions.digest(source,'sha256'),'hex'),jsonb_build_object('claims',out_claims),jsonb_build_object('reply',p_text,'actor',auth.uid()),'{}',0) returning id into run;
 insert into public.jobs(report_id,report_version,pipeline_version,run_id,parent_claim_id,question_id) values(r.id,new_version,'followup-v1',run,c.id,p_question);
 -- Accepted evidence is never changed while a correction proposal is being prepared.
 if c.state<>'accepted' then update public.claims set state='clarification',version=version+1 where id=c.id;end if;
 update public.verification_requests set status='superseded',version=version+1 where claim_id=c.id and status not in ('superseded','cancelled');
 return jsonb_build_object('reportId',r.id,'reportVersion',new_version,'processing','queued');
end $$;
create or replace function public.respond_clarification(p_question uuid,p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.clarification_requests;c public.claims;r public.reports;result jsonb;facts jsonb;all_facts jsonb='[]';v record;ids uuid[];answer text;note text;matches integer=0;
begin
 p_command=p_command||jsonb_build_object('_resource',p_question,'_operation','respond_clarification');
 select * into q from public.clarification_requests where id=p_question;
 perform 1 from public.projects where id=q.project_id for update;
 select * into r from public.reports where id=q.report_id for update;
 if not app_private.is_member(q.project_id) or r.author_id<>auth.uid() then raise exception 'Only the reporter can answer' using errcode='42501';end if;
 result=app_private.replay_followup(q.project_id,p_command);if result is not null then return result;end if;
 select * into q from public.clarification_requests where id=p_question for update;select * into c from public.claims where id=q.claim_id for update;
 if r.lifecycle<>'submitted' or q.status<>'open' or q.version is distinct from (p_command->>'expectedQuestionVersion')::integer or c.version<>q.claim_version or c.state<>'clarification' then raise exception 'STALE_QUESTION' using errcode='40001';end if;
 answer=p_command->>'answer';note=trim(coalesce(p_command->>'text',''));
 if length(note)>1000 or answer is null or answer not in ('answer','yes','no','not_sure') then raise exception 'Invalid reply' using errcode='22023';end if;
 if answer<>'not_sure' and q.reason_code='location' and jsonb_array_length(coalesce(p_command->'activityIds','[]'))>0 and length(note)>0 then raise exception 'MIXED_LOCATION_REPLY' using errcode='22023';end if;
 if q.reason_code='scope' and answer='yes' and length(note)>0 then raise exception 'SCOPE_REPLY_NEEDS_REVIEW' using errcode='22023';end if;
 if answer='not_sure' or q.reason_code='detail' then
  update public.clarification_requests set status='answered',version=version+1 where id=q.id;
  update public.claims set followup_round=followup_round+1,version=version+1,manual_review=(followup_round+1>=2 or q.reason_code='detail') where id=c.id;
  insert into public.clarification_responses(request_id,project_id,actor_id,question_version,input) values(q.id,q.project_id,auth.uid(),q.version,p_command);
  if q.reason_code<>'detail' then perform app_private.ask_claim(c.id,q.reason_code);end if;
  return app_private.save_followup(q.project_id,p_command,jsonb_build_object('reportId',r.id,'status','needs_review'),'clarification.uncertain');
 end if;
 facts=c.facts;
 if q.reason_code='location' then
  select array_agg(value::uuid) into ids from jsonb_array_elements_text(coalesce(p_command->'activityIds','[]'));
  if coalesce(cardinality(ids),0)>8 then raise exception 'Too many choices' using errcode='22023';end if;
  if cardinality(ids)>0 then
   if exists(select 1 from unnest(ids) id where not exists(select 1 from jsonb_array_elements(q.options) opt where (opt->>'activityId')::uuid=id) or not app_private.reporter_assigned(q.project_id,id,auth.uid())) then raise exception 'Choice no longer permitted' using errcode='42501';end if;
  elsif length(note)=0 then raise exception 'Location required' using errcode='22023';end if;
  for v in select a.external_id,pv.* from public.activity_plan_versions pv join public.projects p on p.id=pv.project_id and p.active_revision_id=pv.revision_id join public.activities a on a.project_id=p.id and a.id=pv.activity_id and a.active
   where pv.project_id=q.project_id and (case when cardinality(ids)>0 then pv.activity_id=any(ids) else
    (lower(pv.location)=lower(note) or lower(trim(regexp_replace(pv.location,'^.*/','')))=lower(note)) and (facts->>'stage' is null or lower(replace(pv.stage,'_',' '))=lower(replace(facts->>'stage','_',' '))) end)
  loop
   matches=matches+1;
   -- Free text identifies a location only. Multiple matches stay ambiguous; only explicit permitted choices split scope.
   if cardinality(ids)>0 then all_facts=all_facts||jsonb_build_array(facts||jsonb_build_object('location',v.location,'activityHint',v.external_id,'stage',v.stage,'discipline',v.discipline,'assetTag',null));end if;
  end loop;
  if coalesce(cardinality(ids),0)=0 then all_facts=jsonb_build_array(facts||jsonb_build_object('location',note,'activityHint',null,'assetTag',null));end if;
  if jsonb_array_length(all_facts)=0 then raise exception 'Location no longer available' using errcode='40001';end if;
  note=case when cardinality(ids)>0 then (select string_agg(opt->>'label','; ') from jsonb_array_elements(q.options) opt where (opt->>'activityId')::uuid=any(ids)) else note end;
 elsif q.reason_code='date' then
  if p_command->>'eventDate' is null then raise exception 'Date required' using errcode='22023';end if;
  perform (p_command->>'eventDate')::date;facts=facts||jsonb_build_object('eventDate',p_command->>'eventDate','dateOrigin','reporter_confirmed');if facts->'observation'->>'version'='2' then facts=jsonb_set(jsonb_set(jsonb_set(jsonb_set(facts,'{observation,dateBasis}','"confirmed"'),'{observation,dateEvidence}',to_jsonb('Reporter answered work-date question'::text)),'{observation,coverageStart}',p_command->'eventDate'),'{observation,coverageEnd}',p_command->'eventDate');end if;note=p_command->>'eventDate';all_facts=jsonb_build_array(facts);
 elsif q.reason_code='scope' then
  if answer not in ('yes','no') then raise exception 'Confirm scope' using errcode='22023';end if;
  facts=facts||jsonb_build_object('fullScope',answer='yes','scope',case when answer='yes' then 'activity' else 'item' end);note=case when answer='yes' then 'The whole activity is finished; nothing remains.' else 'Only part of the activity is finished. '||note end;all_facts=jsonb_build_array(facts);
 elsif q.reason_code='assignment' then
  if answer not in ('yes','no') or length(note)=0 then raise exception 'Confirm location and who assigned the work' using errcode='22023';end if;
  if answer='no' then facts=facts||jsonb_build_object('location',null,'assetTag',null,'activityHint',null);end if;
  all_facts=jsonb_build_array(facts);note=case when answer='yes' then 'The reported location is correct. Assigned by: ' else 'The reported location was wrong. ' end||note;
 end if;
 update public.clarification_requests set status='answered',version=version+1 where id=q.id;
 result=app_private.queue_reply(c.id,all_facts,q.question_text||' Reply: '||note,q.id);
 insert into public.clarification_responses(request_id,project_id,actor_id,question_version,input,resulting_report_version) values(q.id,q.project_id,auth.uid(),q.version,p_command,(result->>'reportVersion')::integer);
 return app_private.save_followup(q.project_id,p_command,result,'clarification.answered');
end $$;

create index observation_activity on public.progress_observations(project_id,activity_id,outcome);
create index candidate_activity on public.candidate_matches(project_id,activity_id,rank);
