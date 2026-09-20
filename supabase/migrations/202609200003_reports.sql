-- Evidence is immutable; proposals have no schedule effect until a planner commits a decision.
create table public.reports (
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id),author_id uuid not null,
 capture_id uuid not null,current_version integer not null default 1,lifecycle text not null default 'submitted' check(lifecycle in ('draft','submitted','withdrawn')),
 received_at timestamptz not null default now(),source_kind text not null default 'text' check(source_kind='text'),
 unique(project_id,id),unique(project_id,author_id,capture_id),foreign key(project_id,author_id) references public.project_members(project_id,user_id)
);
create table public.report_versions (
 report_id uuid not null references public.reports(id),version integer not null,source_text text not null check(length(source_text) between 1 and 10000),
 work_date date,selected_activity_id uuid,content_hash text not null,context jsonb not null,created_at timestamptz not null default now(),primary key(report_id,version)
);
create table public.processing_runs (
 id uuid primary key default gen_random_uuid(),report_id uuid not null,report_version integer not null,pipeline_version text not null,
 provider text not null,model_id text not null,prompt_hash text not null,input_hash text not null,output jsonb not null,raw_output jsonb not null,
 usage jsonb not null,latency_ms integer not null,created_at timestamptz not null default now(),
 foreign key(report_id,report_version) references public.report_versions(report_id,version),unique(report_id,report_version,pipeline_version)
);
create table public.jobs (
 id uuid primary key default gen_random_uuid(),report_id uuid not null,report_version integer not null,pipeline_version text not null default 'text-v1',
 status text not null default 'queued' check(status in ('queued','running','retry_wait','succeeded','failed')),
 attempts integer not null default 0,next_run_at timestamptz not null default now(),lease_until timestamptz,lease_token uuid,error_code text,run_id uuid references public.processing_runs(id),
 created_at timestamptz not null default now(),foreign key(report_id,report_version) references public.report_versions(report_id,version),unique(report_id,report_version,pipeline_version)
);
create table public.claims (
 id uuid primary key default gen_random_uuid(),project_id uuid not null,report_id uuid not null,report_version integer not null,run_id uuid not null references public.processing_runs(id),
 ordinal integer not null,facts jsonb not null,validation_flags text[] not null default '{}',state text not null default 'pending' check(state in ('pending','clarification','verification','accepted','rejected','unplanned')),
 version integer not null default 1,plan_revision_id uuid not null,policy_version integer not null,
 foreign key(project_id,report_id) references public.reports(project_id,id),foreign key(report_id,report_version) references public.report_versions(report_id,version),
 foreign key(project_id,plan_revision_id) references public.schedule_revisions(project_id,id),unique(run_id,ordinal),unique(project_id,id)
);
create table public.candidate_matches (
 claim_id uuid references public.claims(id),project_id uuid not null,activity_id uuid not null,revision_id uuid not null,rank integer not null check(rank between 1 and 8),
 score numeric not null check(score between 0 and 1),features jsonb not null,mismatch_flags text[] not null default '{}',
 primary key(claim_id,activity_id),foreign key(project_id,claim_id) references public.claims(project_id,id),foreign key(project_id,activity_id,revision_id) references public.activity_plan_versions(project_id,activity_id,revision_id)
);
create table public.review_decisions (
 id uuid primary key default gen_random_uuid(),project_id uuid not null,command_id uuid not null,claim_id uuid not null,actor_id uuid not null,
 action text not null,input jsonb not null,result jsonb not null,reason text not null,created_at timestamptz not null default now(),
 unique(project_id,command_id),foreign key(project_id,claim_id) references public.claims(project_id,id)
);
create table public.accepted_events (
 id uuid primary key default gen_random_uuid(),project_id uuid not null,claim_id uuid not null,decision_id uuid not null unique references public.review_decisions(id),
 activity_id uuid not null,event_kind text not null check(event_kind in ('START','FINISH','ITEM_PROGRESS')),facts jsonb not null,created_at timestamptz not null default now(),
 foreign key(project_id,claim_id) references public.claims(project_id,id),foreign key(project_id,activity_id) references public.activities(project_id,id),unique(claim_id)
);
alter table public.activity_actuals add column accepted_quantity numeric not null default 0 check(accepted_quantity>=0);
create table public.delivery_outbox (
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id),event_id uuid not null references public.accepted_events(id),
 activity_id uuid not null,destination text not null default 'exchange-preview',state text not null default 'pending' check(state in ('pending','exported','sent','verified','conflict','failed')),
 patch jsonb not null,expected_source jsonb not null,created_at timestamptz not null default now(),unique(event_id,destination),foreign key(project_id,activity_id) references public.activities(project_id,id)
);
create index due_jobs on public.jobs(next_run_at) where status in ('queued','retry_wait','running');
create index report_author on public.reports(project_id,author_id,received_at desc);
create index pending_claims on public.claims(project_id,state);
create function app_private.can_read_report(p_report uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.reports r where r.id=p_report and app_private.is_member(r.project_id) and (r.author_id=auth.uid() or app_private.is_planner(r.project_id)))
$$;
revoke all on function app_private.can_read_report(uuid) from public,anon;
grant execute on function app_private.can_read_report(uuid) to authenticated;
alter table public.reports enable row level security;
create policy reports_read on public.reports for select to authenticated using(app_private.can_read_report(id));
alter table public.report_versions enable row level security;
create policy versions_read on public.report_versions for select to authenticated using(app_private.can_read_report(report_id));
alter table public.processing_runs enable row level security;
-- Raw provider payloads and usage are worker/operator data, not reporter data.
alter table public.jobs enable row level security;
create policy jobs_read on public.jobs for select to authenticated using(app_private.can_read_report(report_id));
alter table public.claims enable row level security;
create policy claims_read on public.claims for select to authenticated using(app_private.can_read_report(report_id));
alter table public.candidate_matches enable row level security;
create policy candidates_read on public.candidate_matches for select to authenticated using(app_private.is_planner(project_id));
alter table public.review_decisions enable row level security;
create policy decisions_read on public.review_decisions for select to authenticated using(app_private.is_planner(project_id));
alter table public.accepted_events enable row level security;
create policy events_read on public.accepted_events for select to authenticated using(app_private.can_read_activity(project_id,activity_id));
alter table public.delivery_outbox enable row level security;
create policy outbox_read on public.delivery_outbox for select to authenticated using(app_private.is_planner(project_id));
revoke all on public.reports,public.report_versions,public.processing_runs,public.jobs,public.claims,public.candidate_matches,public.review_decisions,public.accepted_events,public.delivery_outbox from anon,authenticated;
grant select on public.reports,public.report_versions,public.claims,public.candidate_matches,public.review_decisions,public.accepted_events,public.delivery_outbox to authenticated;
grant select(id,report_id,report_version,status,attempts,error_code,created_at) on public.jobs to authenticated;
grant all on public.reports,public.report_versions,public.processing_runs,public.jobs,public.claims,public.candidate_matches,public.review_decisions,public.accepted_events,public.delivery_outbox to service_role;
create trigger immutable_report_version before update or delete on public.report_versions for each row execute function app_private.immutable_history();
create trigger immutable_run before update or delete on public.processing_runs for each row execute function app_private.immutable_history();
create trigger immutable_decision before update or delete on public.review_decisions for each row execute function app_private.immutable_history();
create trigger immutable_event before update or delete on public.accepted_events for each row execute function app_private.immutable_history();

create function public.capture_text_report(p_project uuid,p_capture uuid,p_text text,p_work_date date,p_activity uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.reports; v public.report_versions; payload jsonb; fingerprint text; revision uuid;
begin
 perform 1 from public.projects where id=p_project for update;
 if not app_private.is_member(p_project) then raise exception 'Project access denied' using errcode='42501'; end if;
 if p_capture is null or p_text is null or length(trim(p_text)) not between 1 and 10000 then raise exception 'Invalid report' using errcode='22023'; end if;
 if p_activity is not null and not app_private.can_read_activity(p_project,p_activity) then raise exception 'Activity access denied' using errcode='42501'; end if;
 payload=jsonb_build_object('text',trim(p_text),'workDate',p_work_date,'activity',p_activity);
 fingerprint=encode(extensions.digest(payload::text,'sha256'),'hex');
 select * into r from public.reports where project_id=p_project and author_id=auth.uid() and capture_id=p_capture;
 if found then
  select * into v from public.report_versions where report_id=r.id and version=1;
  if v.content_hash<>fingerprint then raise exception 'CAPTURE_ID_REUSED' using errcode='40001'; end if;
  return r.id;
 end if;
 select active_revision_id into revision from public.projects where id=p_project;
 if revision is null then raise exception 'No active plan' using errcode='22023'; end if;
 insert into public.reports(project_id,author_id,capture_id) values(p_project,auth.uid(),p_capture) returning * into r;
 insert into public.report_versions(report_id,version,source_text,work_date,selected_activity_id,content_hash,context)
 values(r.id,1,trim(p_text),p_work_date,p_activity,fingerprint,jsonb_build_object('planRevisionId',revision,'submissionMode','raw_for_review','confirmedBy',auth.uid()));
 insert into public.jobs(report_id,report_version) values(r.id,1);
 insert into public.admin_audit(project_id,actor,action,reason,detail) values(p_project,auth.uid()::text,'report.submitted','Reporter confirmed original text',jsonb_build_object('reportId',r.id,'hash',fingerprint));
 return r.id;
end $$;
revoke all on function public.capture_text_report(uuid,uuid,text,date,uuid) from public,anon;
grant execute on function public.capture_text_report(uuid,uuid,text,date,uuid) to authenticated;

create function public.lease_report_job() returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.jobs;
begin
 update public.jobs set status='failed',error_code='attempts_exhausted',lease_token=null,lease_until=null where status='running' and lease_until<now() and attempts>=4;
 select * into j from public.jobs where attempts<4 and ((status in ('queued','retry_wait') and next_run_at<=now()) or (status='running' and lease_until<now())) order by created_at for update skip locked limit 1;
 if not found then return null; end if;
 update public.jobs set status='running',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '120 seconds',error_code=null where id=j.id returning * into j;
 return to_jsonb(j);
end $$;
create function public.heartbeat_report_job(p_job uuid,p_token uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 update public.jobs set lease_until=now()+interval '120 seconds' where id=p_job and status='running' and lease_token=p_token and lease_until>now();
 return found;
end $$;
create function public.record_extraction(p_job uuid,p_token uuid,p_result jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare j public.jobs; run uuid;
begin
 select * into j from public.jobs where id=p_job and status='running' and lease_token=p_token and lease_until>now() for update;
 if not found then raise exception 'LEASE_LOST' using errcode='40001'; end if;
 if j.run_id is not null then return j.run_id; end if;
 insert into public.processing_runs(report_id,report_version,pipeline_version,provider,model_id,prompt_hash,input_hash,output,raw_output,usage,latency_ms)
 values(j.report_id,j.report_version,j.pipeline_version,p_result->>'provider',p_result->>'model',p_result->>'promptHash',p_result->>'inputHash',p_result->'output',p_result->'raw',p_result->'usage',(p_result->>'latencyMs')::integer) returning id into run;
 update public.jobs set run_id=run where id=j.id;
 return run;
end $$;
create function public.finish_report_job(p_job uuid,p_token uuid,p_revision uuid,p_policy integer,p_claims jsonb) returns void language plpgsql security definer set search_path='' as $$
declare j public.jobs; r public.reports; c jsonb; candidate jsonb; claim_id uuid; ordinal integer=0;
begin
 select * into j from public.jobs where id=p_job for update;
 if j.status<>'running' or j.lease_token is distinct from p_token or j.lease_until<=now() or j.run_id is null then raise exception 'LEASE_LOST' using errcode='40001'; end if;
 select * into r from public.reports where id=j.report_id;
 if r.current_version<>j.report_version or r.lifecycle<>'submitted' then raise exception 'STALE_REPORT' using errcode='40001'; end if;
 if jsonb_typeof(p_claims)<>'array' or jsonb_array_length(p_claims) not between 1 and 20 then raise exception 'Invalid claims'; end if;
 for c in select value from jsonb_array_elements(p_claims) loop
  ordinal=ordinal+1;
  insert into public.claims(project_id,report_id,report_version,run_id,ordinal,facts,validation_flags,plan_revision_id,policy_version)
  values(r.project_id,r.id,j.report_version,j.run_id,ordinal,c->'facts',array(select jsonb_array_elements_text(c->'flags')),p_revision,p_policy) returning id into claim_id;
  for candidate in select value from jsonb_array_elements(c->'candidates') loop
   insert into public.candidate_matches values(claim_id,r.project_id,(candidate->>'activityId')::uuid,p_revision,(candidate->>'rank')::integer,(candidate->>'score')::numeric,candidate->'features',array(select jsonb_array_elements_text(candidate->'flags')));
  end loop;
 end loop;
 update public.jobs set status='succeeded',lease_token=null,lease_until=null where id=j.id;
end $$;
create function public.fail_report_job(p_job uuid,p_token uuid,p_code text,p_retry boolean,p_delay integer) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.jobs set status=case when p_retry and attempts<4 then 'retry_wait' else 'failed' end,error_code=left(p_code,80),next_run_at=now()+make_interval(secs=>greatest(1,least(p_delay,900))),lease_token=null,lease_until=null where id=p_job and status='running' and lease_token=p_token and lease_until>now();
 if not found then raise exception 'LEASE_LOST' using errcode='40001'; end if;
end $$;
revoke all on function public.lease_report_job(),public.heartbeat_report_job(uuid,uuid),public.record_extraction(uuid,uuid,jsonb),public.finish_report_job(uuid,uuid,uuid,integer,jsonb),public.fail_report_job(uuid,uuid,text,boolean,integer) from public,anon,authenticated;
grant execute on function public.lease_report_job(),public.heartbeat_report_job(uuid,uuid),public.record_extraction(uuid,uuid,jsonb),public.finish_report_job(uuid,uuid,uuid,integer,jsonb),public.fail_report_job(uuid,uuid,text,boolean,integer) to service_role;
