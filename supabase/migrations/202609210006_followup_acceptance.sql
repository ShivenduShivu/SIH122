create or replace function public.finish_report_job(p_job uuid,p_token uuid,p_revision uuid,p_policy integer,p_claims jsonb) returns void language plpgsql security definer set search_path='' as $$
declare j public.jobs; r public.reports; c jsonb; candidate jsonb; claim_id uuid; ordinal integer=0;parent public.claims;correction uuid;
begin
 perform 1 from public.projects where id=(select source_report.project_id from public.jobs leased_job join public.reports source_report on source_report.id=leased_job.report_id where leased_job.id=p_job) for update;
 select * into j from public.jobs where id=p_job for update;
 if j.status<>'running' or j.lease_token is distinct from p_token or j.lease_until<=now() or j.run_id is null then raise exception 'LEASE_LOST' using errcode='40001'; end if;
 select * into r from public.reports where id=j.report_id;
 if r.lifecycle<>'submitted' then raise exception 'STALE_REPORT' using errcode='40001'; end if;
 if jsonb_typeof(p_claims)<>'array' or jsonb_array_length(p_claims) not between 1 and 20 then raise exception 'Invalid claims'; end if;
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

create or replace function public.decide_claim(p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
<<acceptance>>
declare c public.claims;r public.reports;p public.projects;a public.activity_actuals;v public.activity_plan_versions;m public.project_members;
 d public.review_decisions;chosen uuid;cmd uuid;action text;reason text;event_date date;kind text;facts jsonb;before_actuals jsonb;result jsonb;decision uuid=gen_random_uuid();event uuid=gen_random_uuid();quantity numeric;mode text;verification public.verification_requests;old_event public.accepted_events;
begin
 select * into c from public.claims where id=(p_command->>'claimId')::uuid;
 if not found or not app_private.is_planner(c.project_id) then raise exception 'Review authority required' using errcode='42501'; end if;
 select * into p from public.projects where id=c.project_id for update;
 if not app_private.is_planner(c.project_id) then raise exception 'Membership changed' using errcode='42501'; end if;
 select * into r from public.reports where id=c.report_id for update;
 select * into c from public.claims where id=c.id for update;
 cmd=(p_command->>'commandId')::uuid;action=p_command->>'action';reason=p_command->>'reason';
 if cmd is null or coalesce(length(trim(reason)),0) not between 1 and 1000 or action is null or action not in ('accept','reject','unplanned') then raise exception 'Invalid decision' using errcode='22023'; end if;
 select * into d from public.review_decisions where project_id=p.id and command_id=cmd;
 if found then
  if d.actor_id<>auth.uid() or d.input<>p_command then raise exception 'COMMAND_ID_REUSED' using errcode='40001'; end if;
  return d.result;
 end if;
 if r.lifecycle<>'submitted' or c.report_version is distinct from (p_command->>'expectedReportVersion')::integer
 or c.run_id is distinct from (p_command->>'expectedRunId')::uuid or c.version is distinct from (p_command->>'expectedClaimVersion')::integer or (c.state<>'pending' and not (action in ('reject','unplanned') and c.state in ('clarification','verification','disputed')))
 or p.active_revision_id is distinct from (p_command->>'expectedPlanRevisionId')::uuid or c.plan_revision_id<>p.active_revision_id
 or p.policy_version is distinct from (p_command->>'expectedPolicyVersion')::integer then raise exception 'STALE_REVIEW' using errcode='40001'; end if;
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
 if not exists(select 1 from public.candidate_matches where claim_id=c.id and activity_id=chosen and cardinality(mismatch_flags)=0) then raise exception 'MATCH_REQUIRES_CLARIFICATION' using errcode='22023'; end if;
 if exists(select 1 from unnest(c.validation_flags) f where f<>'Work date missing' or p_command->>'correctedDate' is null) then raise exception 'MISSING_OR_UNRESOLVED_FACTS' using errcode='22023'; end if;
 select * into m from public.project_members where project_id=p.id and user_id=r.author_id and active;
 if not found then raise exception 'Reporter membership revoked' using errcode='42501'; end if;
 -- Assignment is context, never proof of work. A mismatch stays blocked for Phase 4 verification.
 if exists(select 1 from public.clarification_requests where claim_id=c.id and status in ('open','answered')) then raise exception 'OPEN_QUESTION' using errcode='22023';end if;
 select * into verification from public.verification_requests where claim_id=c.id and status not in ('superseded','cancelled');
 if found or not app_private.reporter_assigned(p.id,chosen,r.author_id) then
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
 if kind is null or kind not in ('START','FINISH','ITEM_PROGRESS') then raise exception 'NON_EXECUTION_CLAIM' using errcode='22023'; end if;
 if p_command->>'correctedDate' is not null then facts=jsonb_set(jsonb_set(facts,'{eventDate}',p_command->'correctedDate'),'{dateOrigin}','"planner_corrected"'); end if;
 event_date=(facts->>'eventDate')::date;
 if event_date is null then raise exception 'MISSING_EVENT_DATE' using errcode='22023'; end if;
 select * into a from public.activity_actuals where project_id=p.id and activity_id=chosen for update;
 if not found or a.version is distinct from (p_command->>'expectedActualsVersion')::integer then raise exception 'STALE_ACTUALS' using errcode='40001'; end if;
 before_actuals=to_jsonb(a);
 if c.correction_of_event_id is not null then
  select * into old_event from public.accepted_events where id=c.correction_of_event_id;
  if not found or old_event.project_id<>p.id or old_event.activity_id<>chosen or old_event.event_kind<>kind or kind not in ('START','FINISH') or exists(select 1 from public.accepted_events where supersedes_event_id=old_event.id) then raise exception 'STALE_CORRECTION' using errcode='40001';end if;
  if kind='START' then
   if a.actual_start is distinct from (old_event.facts->>'eventDate')::date or (a.actual_finish is not null and event_date>a.actual_finish) or exists(select 1 from public.accepted_events e where e.activity_id=chosen and e.event_kind='ITEM_PROGRESS' and (e.facts->>'eventDate')::date<event_date) then raise exception 'CORRECTION_DATE_CONFLICT' using errcode='22023';end if;
   a.actual_start=event_date;
  else
   if a.actual_finish is distinct from (old_event.facts->>'eventDate')::date or a.actual_start is null or event_date<a.actual_start or exists(select 1 from public.accepted_events e where e.activity_id=chosen and e.event_kind='ITEM_PROGRESS' and (e.facts->>'eventDate')::date>event_date) then raise exception 'CORRECTION_DATE_CONFLICT' using errcode='22023';end if;
   a.actual_finish=event_date;
  end if;
 elsif kind='START' then
  if facts->>'scope' is distinct from 'activity' then raise exception 'PARTIAL_SCOPE' using errcode='22023'; end if;
  if a.actual_start is not null then raise exception 'EXISTING_START_REQUIRES_RECONCILIATION' using errcode='40001'; end if;
  a.actual_start=event_date;
 elsif kind='FINISH' then
  if facts->>'scope' is distinct from 'activity' or (facts->>'fullScope')::boolean is distinct from true then raise exception 'PARTIAL_SCOPE_CANNOT_FINISH' using errcode='22023'; end if;
  if a.actual_start is null then raise exception 'MISSING_ACTUAL_START' using errcode='22023'; end if;
  if a.actual_finish is not null then raise exception 'EXISTING_FINISH_REQUIRES_RECONCILIATION' using errcode='40001'; end if;
  if event_date<a.actual_start then raise exception 'FINISH_BEFORE_START' using errcode='22023'; end if;
  if facts->'quantity'<>'null'::jsonb and ((facts->'quantity'->>'unit')<>v.unit or (facts->'quantity'->>'value')::numeric<v.target_quantity) then raise exception 'INCOMPLETE_QUANTITY' using errcode='22023'; end if;
  a.actual_finish=event_date;
 else
  quantity=(facts->'quantity'->>'value')::numeric;mode=facts->'quantity'->>'mode';
  if quantity is null or quantity<=0 or (facts->'quantity'->>'unit') is distinct from v.unit or mode is null or mode not in ('delta','cumulative') then raise exception 'QUANTITY_SCOPE_REQUIRES_REVIEW' using errcode='22023'; end if;
  if a.actual_start is null or a.actual_finish is not null or event_date<a.actual_start then raise exception 'QUANTITY_DATE_OR_STATE_CONFLICT' using errcode='22023'; end if;
  if exists(select 1 from public.accepted_events e where e.project_id=p.id and e.activity_id=chosen and e.event_kind='ITEM_PROGRESS' and e.facts->>'eventDate'=event_date::text and e.facts->'quantity'=acceptance.facts->'quantity') then raise exception 'POSSIBLE_DUPLICATE_QUANTITY' using errcode='40001'; end if;
  quantity=case when mode='delta' then a.accepted_quantity+quantity else quantity end;
  if quantity<=a.accepted_quantity or quantity>v.target_quantity then raise exception 'QUANTITY_REQUIRES_CORRECTION' using errcode='22023'; end if;
  a.accepted_quantity=quantity;
 end if;
 a.version=a.version+1;
 result=jsonb_build_object('state','accepted','claimId',c.id,'eventId',event,'activityId',chosen,'actualsVersion',a.version,'scheduleVersion',p.schedule_version+1,'deliveryState',case when kind='ITEM_PROGRESS' then 'not_required' else 'pending' end);
 insert into public.review_decisions values(decision,p.id,cmd,c.id,auth.uid(),'accept',p_command,result,reason,now());
 insert into public.accepted_events(id,project_id,claim_id,decision_id,activity_id,event_kind,facts,created_at,supersedes_event_id) values(event,p.id,c.id,decision,chosen,kind,facts,now(),c.correction_of_event_id);
 update public.activity_actuals set actual_start=a.actual_start,actual_finish=a.actual_finish,accepted_quantity=a.accepted_quantity,version=a.version where project_id=p.id and activity_id=chosen;
 update public.claims set state='accepted',version=version+1 where id=c.id;
 update public.projects set schedule_version=schedule_version+1 where id=p.id;
 insert into public.admin_audit(project_id,actor,action,reason,detail) values(p.id,auth.uid()::text,'claim.accepted',reason,jsonb_build_object('claimId',c.id,'eventId',event,'decisionId',decision,'before',before_actuals,'after',to_jsonb(a)));
 if kind<>'ITEM_PROGRESS' then
  insert into public.delivery_outbox(project_id,event_id,activity_id,patch,expected_source) values(p.id,event,chosen,jsonb_build_object('actualStart',a.actual_start,'actualFinish',a.actual_finish,'actualsVersion',a.version),jsonb_build_object('actualStart',before_actuals->'actual_start','actualFinish',before_actuals->'actual_finish'));
 end if;
 return result;
end $$;
revoke all on function public.decide_claim(jsonb) from public,anon;
grant execute on function public.decide_claim(jsonb) to authenticated;
