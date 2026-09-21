-- Preserve original speech and attachment references through accepted exchange history.
create function app_private.immutable_received_attachment() returns trigger language plpgsql set search_path='' as $$
begin
 if old.state='received' or (to_jsonb(old)-'state') is distinct from (to_jsonb(new)-'state') then raise exception 'Evidence reservation is immutable';end if;return new;
end $$;
create trigger immutable_attachment before update on public.attachments for each row execute function app_private.immutable_received_attachment();
create or replace function app_private.execution_rows(p_project uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
 'eventId',e.id,'claimId',c.id,'reportId',c.report_id,'decisionId',d.id,'activityId',a.id,
 'externalId',a.external_id,'activityName',v.name,'discipline',v.discipline,'location',v.location,
 'revisionId',c.plan_revision_id,'eventKind',e.event_kind,'eventDate',e.facts->>'eventDate',
 'facts',e.facts,'quote',e.facts->>'evidenceQuote','reason',d.reason,'reviewer',m.display_name,
 'reviewerId',d.actor_id,'acceptedAt',e.created_at,'supersedesEventId',e.supersedes_event_id,
 'effective',not exists(select 1 from public.accepted_events newer where newer.supersedes_event_id=e.id),
 'sourceId',rv.context->'sourceEnvelope'->>'sourceRecordId','source',rv.source_text,
 'provenance',rv.context->'sourceEnvelope','media',rv.context->'media','matchScore',cm.score,'matchReasons',cm.features,
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
create or replace function public.create_planner_export(p_project uuid,p_command uuid,p_revision uuid,p_version bigint) returns uuid
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
  'evidence.csv',jsonb_build_object('rows',jsonb_array_length(events),'content',app_private.exchange_csv(events,array['eventId','claimId','reportId','decisionId','auditId','externalId','revisionId','eventKind','eventDate','effective','supersedesEventId','sourceId','quote','facts','provenance','media','matchScore','reviewer','reviewerId','acceptedAt','reason','sourceUrl'])),
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

