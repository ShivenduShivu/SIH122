-- Top-level evidence with no construction claims completes without inventing progress.
-- A clarification/correction still requires at least one claim before it can resolve its parent.
alter table public.jobs add column claim_count integer check (claim_count between 0 and 100);
grant select(claim_count) on public.jobs to authenticated;
update public.jobs j set claim_count=(select count(*) from public.claims c where c.report_id=j.report_id and c.report_version=j.report_version) where j.status='succeeded';

create or replace function public.finish_report_job(p_job uuid,p_token uuid,p_revision uuid,p_policy integer,p_claims jsonb) returns void language plpgsql security definer set search_path='' as $$
declare j public.jobs; r public.reports; c jsonb; candidate jsonb; claim_id uuid; ordinal integer=0;parent public.claims;correction uuid;
begin
 perform 1 from public.projects where id=(select source_report.project_id from public.jobs leased_job join public.reports source_report on source_report.id=leased_job.report_id where leased_job.id=p_job) for update;
 select * into j from public.jobs where id=p_job for update;
 if j.status<>'running' or j.lease_token is distinct from p_token or j.lease_until<=now() or j.run_id is null then raise exception 'LEASE_LOST' using errcode='40001'; end if;
 select * into r from public.reports where id=j.report_id;
 if r.lifecycle<>'submitted' then raise exception 'STALE_REPORT' using errcode='40001'; end if;
 if jsonb_typeof(p_claims)<>'array' or jsonb_array_length(p_claims)>100 or (j.parent_claim_id is not null and jsonb_array_length(p_claims)=0) then raise exception 'Invalid claims'; end if;
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
 update public.jobs set status='succeeded',claim_count=jsonb_array_length(p_claims),lease_token=null,lease_until=null where id=j.id;
 perform public.prepare_report_followups(r.id);
end $$;
