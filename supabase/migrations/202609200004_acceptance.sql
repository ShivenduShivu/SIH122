create function public.decide_claim(p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
<<acceptance>>
declare c public.claims;r public.reports;p public.projects;a public.activity_actuals;v public.activity_plan_versions;m public.project_members;
 d public.review_decisions;chosen uuid;cmd uuid;action text;reason text;event_date date;kind text;facts jsonb;before_actuals jsonb;result jsonb;decision uuid=gen_random_uuid();event uuid=gen_random_uuid();quantity numeric;mode text;
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
 if r.lifecycle<>'submitted' or r.current_version is distinct from (p_command->>'expectedReportVersion')::integer or c.report_version<>r.current_version
 or c.run_id is distinct from (p_command->>'expectedRunId')::uuid or c.version is distinct from (p_command->>'expectedClaimVersion')::integer or c.state<>'pending'
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
 if m.role not in ('planner','manager') and not exists(
  select 1 from public.activities act where act.project_id=p.id and act.id=chosen and act.contractor_id=m.contractor_id and v.discipline=any(m.discipline_scope)
  and (cardinality(m.work_front_scope)=0 or v.location=any(m.work_front_scope))
  and (m.role='supervisor' or exists(select 1 from public.assignment_versions x where x.project_id=p.id and x.activity_id=chosen and x.reporter_id=r.author_id and x.version=(select max(y.version) from public.assignment_versions y where y.project_id=p.id and y.activity_id=chosen)))
 ) then raise exception 'ASSIGNMENT_REQUIRES_VERIFICATION' using errcode='22023'; end if;
 facts=c.facts;kind=facts->>'kind';
 if kind is null or kind not in ('START','FINISH','ITEM_PROGRESS') then raise exception 'NON_EXECUTION_CLAIM' using errcode='22023'; end if;
 if p_command->>'correctedDate' is not null then facts=jsonb_set(jsonb_set(facts,'{eventDate}',p_command->'correctedDate'),'{dateOrigin}','"planner_corrected"'); end if;
 event_date=(facts->>'eventDate')::date;
 if event_date is null then raise exception 'MISSING_EVENT_DATE' using errcode='22023'; end if;
 select * into a from public.activity_actuals where project_id=p.id and activity_id=chosen for update;
 if not found or a.version is distinct from (p_command->>'expectedActualsVersion')::integer then raise exception 'STALE_ACTUALS' using errcode='40001'; end if;
 before_actuals=to_jsonb(a);
 if kind='START' then
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
 insert into public.accepted_events values(event,p.id,c.id,decision,chosen,kind,facts,now());
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

-- A single SQL statement produces rows, counts and their version from one MVCC snapshot.
create function public.schedule_snapshot(p_project uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('projectId',p.id,'projectName',p.name,'revisionId',p.active_revision_id,'policyVersion',p.policy_version,'scheduleVersion',p.schedule_version,
 'activities',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'projectId',p.id,'revisionId',v.revision_id,'externalId',a.external_id,'name',v.name,'discipline',v.discipline,'location',v.location,'stage',v.stage,'plannedStart',v.planned_start,'plannedFinish',v.planned_finish,'baselineStart',v.baseline_start,'baselineFinish',v.baseline_finish,'targetQuantity',v.target_quantity,'unit',v.unit,'actualStart',x.actual_start,'actualFinish',x.actual_finish,'acceptedQuantity',x.accepted_quantity,'actualsVersion',x.version,'assignedReporterId',(select reporter_id from public.assignment_versions q where q.project_id=p.id and q.activity_id=a.id order by version desc limit 1)) order by a.external_id)
 from public.activities a join public.activity_plan_versions v on v.project_id=a.project_id and v.activity_id=a.id and v.revision_id=p.active_revision_id join public.activity_actuals x on x.project_id=a.project_id and x.activity_id=a.id where a.project_id=p.id and a.active),'[]'::jsonb))
 from public.projects p where p.id=p_project
$$;
revoke all on function public.schedule_snapshot(uuid) from public,anon;
grant execute on function public.schedule_snapshot(uuid) to authenticated;
