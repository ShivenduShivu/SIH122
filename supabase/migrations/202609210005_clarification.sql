-- Questions, replies and independent attestations never write actual progress.
alter table public.claims drop constraint claims_state_check;
alter table public.claims add constraint claims_state_check check(state in ('pending','clarification','verification','disputed','accepted','rejected','unplanned','superseded','withdrawn'));
alter table public.claims add column parent_claim_id uuid references public.claims(id),add column root_claim_id uuid references public.claims(id),add column followup_round integer not null default 0,add column manual_review boolean not null default false,add column correction_of_event_id uuid references public.accepted_events(id);
alter table public.jobs add column parent_claim_id uuid references public.claims(id),add column question_id uuid;
alter table public.accepted_events add column supersedes_event_id uuid references public.accepted_events(id);
create unique index one_event_correction on public.accepted_events(supersedes_event_id) where supersedes_event_id is not null;

create table public.followup_commands(project_id uuid not null references public.projects(id),command_id uuid not null,actor_id uuid not null,input jsonb not null,result jsonb not null,created_at timestamptz not null default now(),primary key(project_id,command_id));
create table public.clarification_requests(
 id uuid primary key default gen_random_uuid(),project_id uuid not null,claim_id uuid not null,report_id uuid not null,
 claim_version integer not null,report_version integer not null,version integer not null default 1,
 reason_code text not null check(reason_code in ('location','date','scope','assignment','detail')),
 question_text text not null,options jsonb not null default '[]',automatic boolean not null default true,
 status text not null default 'open' check(status in ('open','answered','resolved','superseded','cancelled')),created_at timestamptz not null default now(),
 foreign key(project_id,claim_id) references public.claims(project_id,id),foreign key(project_id,report_id) references public.reports(project_id,id));
create unique index one_open_question on public.clarification_requests(claim_id) where status='open';
alter table public.jobs add foreign key(question_id) references public.clarification_requests(id);
create table public.clarification_responses(
 id uuid primary key default gen_random_uuid(),request_id uuid not null references public.clarification_requests(id),project_id uuid not null references public.projects(id),actor_id uuid not null,
 question_version integer not null,input jsonb not null,resulting_report_version integer,created_at timestamptz not null default now());
create table public.verification_requests(
 id uuid primary key default gen_random_uuid(),project_id uuid not null,claim_id uuid not null,report_id uuid not null,activity_id uuid not null,
 verifier_id uuid not null,claim_version integer not null,report_version integer not null,plan_revision_id uuid not null,policy_version integer not null,
 assignment_version integer not null,facts_hash text not null,version integer not null default 1,
 status text not null default 'open' check(status in ('open','confirmed','denied','needs_info','superseded','cancelled')),
 allocation_confirmed boolean not null default false,work_confirmed boolean not null default false,created_at timestamptz not null default now(),
 foreign key(project_id,claim_id) references public.claims(project_id,id),foreign key(project_id,report_id) references public.reports(project_id,id),
 foreign key(project_id,activity_id) references public.activities(project_id,id),foreign key(project_id,verifier_id) references public.project_members(project_id,user_id));
create unique index one_active_verification on public.verification_requests(claim_id) where status in ('open','confirmed','needs_info','denied');
create table public.verification_decisions(
 id uuid primary key default gen_random_uuid(),request_id uuid not null references public.verification_requests(id),project_id uuid not null references public.projects(id),actor_id uuid not null,
 request_version integer not null,allocation text not null,work text not null,reason text not null,created_at timestamptz not null default now());
create table public.attachments(
 id uuid primary key default gen_random_uuid(),project_id uuid not null,report_id uuid not null,object_path text not null unique,
 state text not null check(state in ('reserved','received','failed')),file_name text not null,mime_type text not null,byte_size integer not null check(byte_size between 1 and 5242880),
 created_at timestamptz not null default now(),foreign key(project_id,report_id) references public.reports(project_id,id));

create function app_private.verifier_eligible(p_project uuid,p_activity uuid,p_user uuid,p_author uuid) returns boolean language sql stable security definer set search_path='' as $$
 select p_user<>p_author and exists(select 1 from public.project_members m join public.activities a on a.project_id=m.project_id
 join public.projects p on p.id=a.project_id join public.activity_plan_versions v on v.project_id=p.id and v.activity_id=a.id and v.revision_id=p.active_revision_id
 where p.id=p_project and a.id=p_activity and a.active and m.user_id=p_user and m.active
 and (m.role='supervisor' or (m.role in ('planner','manager') and 'field_verify'=any(m.capabilities)))
 and (m.contractor_id=a.contractor_id or 'cross_contractor_verify'=any(m.capabilities)) and v.discipline=any(m.discipline_scope)
 and (cardinality(m.work_front_scope)=0 or v.location=any(m.work_front_scope)))
$$;
create function app_private.reporter_assigned(p_project uuid,p_activity uuid,p_author uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.project_members m join public.projects p on p.id=m.project_id join public.activities a on a.project_id=p.id
 join public.activity_plan_versions v on v.project_id=p.id and v.activity_id=a.id and v.revision_id=p.active_revision_id
 where p.id=p_project and a.id=p_activity and a.active and m.user_id=p_author and m.active and
 (m.role in ('planner','manager') or (m.contractor_id=a.contractor_id and v.discipline=any(m.discipline_scope) and (cardinality(m.work_front_scope)=0 or v.location=any(m.work_front_scope))
 and (m.role='supervisor' or exists(select 1 from public.assignment_versions x where x.project_id=p.id and x.activity_id=a.id and x.reporter_id=m.user_id and x.version=(select max(y.version) from public.assignment_versions y where y.project_id=p.id and y.activity_id=a.id))))))
$$;
create function app_private.can_read_verification(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.verification_requests q join public.reports r on r.id=q.report_id where q.id=p_id and app_private.is_member(q.project_id) and
 (app_private.is_planner(q.project_id) or r.author_id=auth.uid() or (q.verifier_id=auth.uid() and app_private.verifier_eligible(q.project_id,q.activity_id,auth.uid(),r.author_id))))
$$;
create or replace function app_private.can_read_report(p_report uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.reports r where r.id=p_report and app_private.is_member(r.project_id) and
 (r.author_id=auth.uid() or app_private.is_planner(r.project_id) or exists(select 1 from public.verification_requests q where q.report_id=r.id and q.verifier_id=auth.uid() and q.status not in ('cancelled','superseded') and app_private.verifier_eligible(q.project_id,q.activity_id,auth.uid(),r.author_id))))
$$;
alter table public.followup_commands enable row level security;
alter table public.clarification_requests enable row level security;
alter table public.clarification_responses enable row level security;
alter table public.verification_requests enable row level security;
alter table public.verification_decisions enable row level security;
alter table public.attachments enable row level security;
create policy questions_read on public.clarification_requests for select to authenticated using(app_private.can_read_report(report_id));
create policy replies_read on public.clarification_responses for select to authenticated using(exists(select 1 from public.clarification_requests q where q.id=request_id and app_private.can_read_report(q.report_id)));
create policy verification_read on public.verification_requests for select to authenticated using(app_private.can_read_verification(id));
create policy attestation_read on public.verification_decisions for select to authenticated using(app_private.can_read_verification(request_id));
create policy attachment_read on public.attachments for select to authenticated using(app_private.can_read_report(report_id));
revoke all on public.followup_commands,public.clarification_requests,public.clarification_responses,public.verification_requests,public.verification_decisions,public.attachments from anon,authenticated;
grant select on public.clarification_requests,public.clarification_responses,public.verification_requests,public.verification_decisions,public.attachments to authenticated;
grant all on public.followup_commands,public.clarification_requests,public.clarification_responses,public.verification_requests,public.verification_decisions,public.attachments to service_role;
create trigger immutable_followup_command before update or delete on public.followup_commands for each row execute function app_private.immutable_history();
create trigger immutable_reply before update or delete on public.clarification_responses for each row execute function app_private.immutable_history();
create trigger immutable_attestation before update or delete on public.verification_decisions for each row execute function app_private.immutable_history();
create policy verified_report_evidence_read on storage.objects for select to authenticated using(bucket_id='evidence' and exists(select 1 from public.attachments a where a.object_path=name and a.state='received' and app_private.can_read_report(a.report_id)));

create function app_private.replay_followup(p_project uuid,p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare prior public.followup_commands;
begin
 if p_command->>'commandId' is null then raise exception 'Command ID required' using errcode='22023'; end if;
 select * into prior from public.followup_commands where project_id=p_project and command_id=(p_command->>'commandId')::uuid;
 if found then if prior.actor_id<>auth.uid() or prior.input<>p_command then raise exception 'COMMAND_ID_REUSED' using errcode='40001'; end if;return prior.result;end if;return null;
end $$;
-- A structured reply changes only the selected claim. Other accepted/unresolved claims retain their source versions.
create function app_private.queue_reply(p_claim uuid,p_facts jsonb,p_text text,p_question uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.claims;r public.reports;source text;run uuid;facts jsonb;out_claims jsonb='[]';new_version integer;
begin
 select * into c from public.claims where id=p_claim for update;select * into r from public.reports where id=c.report_id for update;
 new_version=r.current_version+1;source=coalesce(c.facts->>'evidenceQuote','')||E'\nRecorded clarification: '||p_text;
 for facts in select value from jsonb_array_elements(p_facts) loop out_claims=out_claims||jsonb_build_array(jsonb_set(facts,'{evidenceQuote}',to_jsonb(source)));end loop;
 insert into public.report_versions(report_id,version,source_text,work_date,selected_activity_id,content_hash,context)
 values(r.id,new_version,source,null,null,encode(extensions.digest(source,'sha256'),'hex'),jsonb_build_object('parentClaimId',c.id,'originalVersion',c.report_version,'questionId',p_question,'confirmedBy',auth.uid(),'submissionMode','structured_reply'));
 update public.reports set current_version=new_version where id=r.id;
 insert into public.processing_runs(report_id,report_version,pipeline_version,provider,model_id,prompt_hash,input_hash,output,raw_output,usage,latency_ms)
 values(r.id,new_version,'followup-v1','structured-input','validated-form-v1','structured-reply-v1',encode(extensions.digest(source,'sha256'),'hex'),jsonb_build_object('claims',out_claims),jsonb_build_object('reply',p_text,'actor',auth.uid()),'{}',0) returning id into run;
 insert into public.jobs(report_id,report_version,pipeline_version,run_id,parent_claim_id,question_id) values(r.id,new_version,'followup-v1',run,c.id,p_question);
 -- Accepted evidence is never changed while a correction proposal is being prepared.
 if c.state<>'accepted' then update public.claims set state='clarification',version=version+1 where id=c.id;end if;
 update public.verification_requests set status='superseded',version=version+1 where claim_id=c.id and status not in ('superseded','cancelled');
 return jsonb_build_object('reportId',r.id,'reportVersion',new_version,'processing','queued');
end $$;

create function public.respond_clarification(p_question uuid,p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
  perform (p_command->>'eventDate')::date;facts=facts||jsonb_build_object('eventDate',p_command->>'eventDate','dateOrigin','reporter_confirmed');note=p_command->>'eventDate';all_facts=jsonb_build_array(facts);
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

create function public.amend_report(p_report uuid,p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
 if c.state='accepted' and c.facts->>'kind' not in ('START','FINISH') then raise exception 'Quantity correction needs item reconciliation' using errcode='22023';end if;
 if exists(select 1 from public.jobs where parent_claim_id=c.id and status in ('queued','running','retry_wait')) then raise exception 'AMENDMENT_PROCESSING' using errcode='40001';end if;
 facts=c.facts||jsonb_build_object('eventDate',p_command->>'eventDate','dateOrigin','reporter_confirmed');
 update public.clarification_requests set status='superseded',version=version+1 where claim_id=c.id and status='open';
 result=app_private.queue_reply(c.id,jsonb_build_array(facts),'Correct work date: '||(p_command->>'eventDate')||'. Reason: '||(p_command->>'reason'));
 return app_private.save_followup(r.project_id,p_command,result,'report.date_amended');
end $$;

create function public.withdraw_report(p_report uuid,p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.reports;result jsonb;
begin
 p_command=p_command||jsonb_build_object('_resource',p_report,'_operation','withdraw_report');
 select * into r from public.reports where id=p_report;perform 1 from public.projects where id=r.project_id for update;
 select * into r from public.reports where id=p_report for update;
 if not app_private.is_member(r.project_id) or (r.author_id<>auth.uid() and not app_private.is_planner(r.project_id)) then raise exception 'Report authority required' using errcode='42501';end if;
 result=app_private.replay_followup(r.project_id,p_command);if result is not null then return result;end if;
 if r.current_version is distinct from (p_command->>'expectedReportVersion')::integer or r.lifecycle<>'submitted' then raise exception 'STALE_REVIEW' using errcode='40001';end if;
 if coalesce(length(trim(p_command->>'reason')),0) not between 1 and 1000 then raise exception 'Reason required' using errcode='22023';end if;
 if exists(select 1 from public.accepted_events e join public.claims c on c.id=e.claim_id where c.report_id=r.id) then raise exception 'REPORT_HAS_ACCEPTED_EVENTS' using errcode='40001';end if;
 update public.reports set lifecycle='withdrawn' where id=r.id;
 update public.claims set state='withdrawn',version=version+1 where report_id=r.id and state not in ('rejected','superseded');
 update public.jobs set status='failed',error_code='report_withdrawn',lease_token=null,lease_until=null where report_id=r.id and status in ('queued','running','retry_wait');
 update public.clarification_requests set status='cancelled',version=version+1 where report_id=r.id and status in ('open','answered');
 update public.verification_requests set status='cancelled',version=version+1 where report_id=r.id and status not in ('superseded','cancelled');
 return app_private.save_followup(r.project_id,p_command,jsonb_build_object('reportId',r.id,'lifecycle','withdrawn'),'report.withdrawn');
end $$;
create function app_private.save_followup(p_project uuid,p_command jsonb,p_result jsonb,p_action text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 insert into public.followup_commands(project_id,command_id,actor_id,input,result) values(p_project,(p_command->>'commandId')::uuid,auth.uid(),p_command,p_result);
 insert into public.admin_audit(project_id,actor,action,reason,detail) values(p_project,auth.uid()::text,p_action,coalesce(p_command->>'reason',p_command->>'text',p_action),p_result);return p_result;
end $$;

-- Templates and permitted choices are computed by the server, never by the model.
create function app_private.ask_claim(p_claim uuid,p_reason text default null,p_automatic boolean default true) returns uuid language plpgsql security definer set search_path='' as $$
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
 when not app_private.reporter_assigned(c.project_id,best,r.author_id) and not exists(select 1 from public.clarification_responses a join public.clarification_requests q on q.id=a.request_id where q.reason_code='assignment' and q.claim_id=coalesce(c.parent_claim_id,c.id) and a.input->>'answer'='yes') then 'assignment'
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
create function public.prepare_report_followups(p_report uuid) returns void language plpgsql security definer set search_path='' as $$
declare row record;
begin
 perform 1 from public.projects where id=(select project_id from public.reports where id=p_report) for update;
 for row in select id from public.claims where report_id=p_report and state='pending' loop perform app_private.ask_claim(row.id);end loop;
end $$;
revoke all on function public.prepare_report_followups(uuid) from public,anon,authenticated;
grant execute on function public.prepare_report_followups(uuid) to service_role;

create function public.request_clarification(p_claim uuid,p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.claims;result jsonb;qid uuid;
begin
 p_command=p_command||jsonb_build_object('_resource',p_claim,'_operation','request_clarification');
 select * into c from public.claims where id=p_claim;
 perform 1 from public.projects where id=c.project_id for update;
 if not app_private.is_planner(c.project_id) then raise exception 'Planner required' using errcode='42501';end if;
 result=app_private.replay_followup(c.project_id,p_command);if result is not null then return result;end if;
 select * into c from public.claims where id=p_claim for update;
 if c.version is distinct from (p_command->>'expectedClaimVersion')::integer or c.state not in ('pending','clarification','verification','disputed') then raise exception 'STALE_REVIEW' using errcode='40001';end if;
 if p_command->>'reasonCode' not in ('location','date','scope','assignment','detail') then raise exception 'Invalid question' using errcode='22023';end if;
 qid=app_private.ask_claim(c.id,p_command->>'reasonCode',false);if qid is null then raise exception 'Question unavailable' using errcode='40001';end if;
 return app_private.save_followup(c.project_id,p_command,jsonb_build_object('questionId',qid),'clarification.requested');
end $$;

create function public.request_verification(p_claim uuid,p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.claims;r public.reports;p public.projects;x public.assignment_versions;result jsonb;chosen uuid;verifier uuid;qid uuid;prior public.verification_requests;
begin
 p_command=p_command||jsonb_build_object('_resource',p_claim,'_operation','request_verification');
 select * into c from public.claims where id=p_claim;select * into p from public.projects where id=c.project_id for update;
 if not app_private.is_planner(c.project_id) then raise exception 'Planner required' using errcode='42501';end if;
 result=app_private.replay_followup(c.project_id,p_command);if result is not null then return result;end if;
 select * into r from public.reports where id=c.report_id for update;select * into c from public.claims where id=p_claim for update;
 if r.lifecycle<>'submitted' or c.version is distinct from (p_command->>'expectedClaimVersion')::integer or c.state not in ('pending','verification','disputed') then raise exception 'STALE_REVIEW' using errcode='40001';end if;
 if coalesce(length(trim(p_command->>'reason')),0) not between 1 and 1000 then raise exception 'Reason required' using errcode='22023';end if;
 chosen=(p_command->>'activityId')::uuid;
 if cardinality(c.validation_flags)>0 or not exists(select 1 from public.candidate_matches where claim_id=c.id and activity_id=chosen and cardinality(mismatch_flags)=0) then raise exception 'MISSING_OR_UNRESOLVED_FACTS' using errcode='22023';end if;
 if not exists(select 1 from public.clarification_responses a join public.clarification_requests q on q.id=a.request_id where q.claim_id=c.parent_claim_id and q.reason_code='assignment' and a.input->>'answer'='yes') then raise exception 'REPORTER_CONFIRMATION_REQUIRED' using errcode='22023';end if;
 select * into prior from public.verification_requests where claim_id=c.id and status not in ('superseded','cancelled');
 if found then
  if prior.status in ('open','needs_info','confirmed') and prior.policy_version=p.policy_version and prior.plan_revision_id=p.active_revision_id and prior.assignment_version=(select max(version) from public.assignment_versions where project_id=p.id and activity_id=chosen) then raise exception 'VERIFICATION_ALREADY_OPEN' using errcode='40001';end if;
  if not exists(select 1 from public.project_members where project_id=p.id and user_id=auth.uid() and active and role='manager') then raise exception 'Manager must authorize another review after denial' using errcode='42501';end if;
  update public.verification_requests set status='superseded',version=version+1 where id=prior.id;
 end if;
 select * into x from public.assignment_versions where project_id=p.id and activity_id=chosen order by version desc limit 1;
 if not found then raise exception 'NO_AUTHORIZED_VERIFIER' using errcode='22023';end if;
 verifier=x.supervisor_id;
 if not app_private.verifier_eligible(p.id,chosen,verifier,r.author_id) then
  select m.user_id into verifier from public.project_members m where m.project_id=p.id and m.role='manager' and app_private.verifier_eligible(p.id,chosen,m.user_id,r.author_id) order by m.user_id limit 1;
 end if;
 if verifier is null or not app_private.verifier_eligible(p.id,chosen,verifier,r.author_id) then raise exception 'NO_AUTHORIZED_VERIFIER' using errcode='22023';end if;
 update public.claims set state='verification',version=version+1 where id=c.id returning * into c;
 insert into public.verification_requests(project_id,claim_id,report_id,activity_id,verifier_id,claim_version,report_version,plan_revision_id,policy_version,assignment_version,facts_hash)
 values(p.id,c.id,r.id,chosen,verifier,c.version,c.report_version,p.active_revision_id,p.policy_version,x.version,encode(extensions.digest(c.facts::text,'sha256'),'hex')) returning id into qid;
 return app_private.save_followup(p.id,p_command,jsonb_build_object('verificationId',qid,'status','open'),'verification.requested');
end $$;

create function public.decide_verification(p_request uuid,p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.verification_requests;c public.claims;r public.reports;p public.projects;result jsonb;allocation text;work text;new_state text;
begin
 p_command=p_command||jsonb_build_object('_resource',p_request,'_operation','decide_verification');
 select * into q from public.verification_requests where id=p_request;select * into p from public.projects where id=q.project_id for update;
 select * into r from public.reports where id=q.report_id for update;
 if q.verifier_id<>auth.uid() or not app_private.verifier_eligible(q.project_id,q.activity_id,auth.uid(),r.author_id) then raise exception 'Independent scoped verifier required' using errcode='42501';end if;
 result=app_private.replay_followup(q.project_id,p_command);if result is not null then return result;end if;
 select * into q from public.verification_requests where id=p_request for update;select * into c from public.claims where id=q.claim_id for update;
 if r.lifecycle<>'submitted' or q.status not in ('open','needs_info') or q.version is distinct from (p_command->>'expectedVersion')::integer or c.version<>q.claim_version or c.state<>'verification'
 or c.report_version<>q.report_version or p.active_revision_id<>q.plan_revision_id or p.policy_version<>q.policy_version or q.facts_hash<>encode(extensions.digest(c.facts::text,'sha256'),'hex')
 or q.assignment_version is distinct from (select max(version) from public.assignment_versions where project_id=q.project_id and activity_id=q.activity_id) then raise exception 'STALE_VERIFICATION' using errcode='40001';end if;
 allocation=p_command->>'allocation';work=p_command->>'work';
 if allocation is null or allocation not in ('confirmed','denied','needs_info') or work is null or work not in ('confirmed','denied','needs_info') or coalesce(length(trim(p_command->>'reason')),0) not between 1 and 1000 then raise exception 'Both checks and a reason are required' using errcode='22023';end if;
 new_state=case when allocation='denied' or work='denied' then 'denied' when allocation='confirmed' and work='confirmed' then 'confirmed' else 'needs_info' end;
 insert into public.verification_decisions(request_id,project_id,actor_id,request_version,allocation,work,reason) values(q.id,q.project_id,auth.uid(),q.version,allocation,work,p_command->>'reason');
 update public.claims set state=case when new_state='confirmed' then 'pending' when new_state='denied' then 'disputed' else 'verification' end,version=version+1 where id=c.id returning * into c;
 update public.verification_requests set status=new_state,allocation_confirmed=allocation='confirmed',work_confirmed=work='confirmed',claim_version=c.version,version=version+1 where id=q.id;
 return app_private.save_followup(q.project_id,p_command,jsonb_build_object('verificationId',q.id,'status',new_state,'version',q.version+1),'verification.decided');
end $$;

-- All command helpers are private. Only the explicitly granted RPC surface is callable.
revoke all on all functions in schema app_private from public,anon,authenticated;
grant execute on function app_private.is_member(uuid),app_private.is_planner(uuid),app_private.can_read_activity(uuid,uuid),app_private.can_read_report(uuid),app_private.can_read_verification(uuid) to authenticated;
revoke all on function public.request_clarification(uuid,jsonb),public.respond_clarification(uuid,jsonb),public.request_verification(uuid,jsonb),public.decide_verification(uuid,jsonb),public.amend_report(uuid,jsonb),public.withdraw_report(uuid,jsonb) from public,anon;
grant execute on function public.request_clarification(uuid,jsonb),public.respond_clarification(uuid,jsonb),public.request_verification(uuid,jsonb),public.decide_verification(uuid,jsonb),public.amend_report(uuid,jsonb),public.withdraw_report(uuid,jsonb) to authenticated;

-- A verifier needs the reporter name, not permission to enumerate project membership.
create or replace function public.verification_context(p_project uuid)
returns table(request_id uuid,reporter_name text)
language sql stable security definer set search_path='' as $$
 select q.id,m.display_name from public.verification_requests q
 join public.reports r on r.id=q.report_id
 join public.project_members m on m.project_id=r.project_id and m.user_id=r.author_id
 where q.project_id=p_project and app_private.can_read_verification(q.id)
$$;
revoke all on function public.verification_context(uuid) from public,anon;
grant execute on function public.verification_context(uuid) to authenticated;
