-- Field media stays in a draft until the reporter confirms the transcript/text.
alter table public.reports drop constraint reports_source_kind_check;
alter table public.reports add constraint reports_source_kind_check check(source_kind in ('text','spreadsheet','voice'));
alter table public.attachments add column sha256 text, add column caption text not null default '',
 add column media_kind text, add column language text;
create table public.field_captures(report_id uuid primary key references public.reports(id),request jsonb not null,submitted_hash text);
create table public.media_jobs(
 attachment_id uuid primary key references public.attachments(id),status text not null default 'queued' check(status in ('queued','running','ready','failed')),
 attempts integer not null default 0,lease_token uuid,lease_until timestamptz,error_code text,created_at timestamptz not null default now());
create table public.media_results(
 attachment_id uuid primary key references public.attachments(id),original_transcript text,provider text,model text,
 sha256 text not null,details jsonb not null,created_at timestamptz not null default now());
alter table public.field_captures enable row level security;
alter table public.media_jobs enable row level security;
alter table public.media_results enable row level security;
create policy field_capture_read on public.field_captures for select to authenticated using(app_private.can_read_report(report_id));
create policy media_job_read on public.media_jobs for select to authenticated using(exists(select 1 from public.attachments a where a.id=attachment_id and app_private.can_read_report(a.report_id)));
create policy media_result_read on public.media_results for select to authenticated using(exists(select 1 from public.attachments a where a.id=attachment_id and app_private.can_read_report(a.report_id)));
revoke all on public.field_captures,public.media_jobs,public.media_results from public,anon,authenticated;
grant select on public.field_captures,public.media_results to authenticated;
grant select(attachment_id,status,attempts,error_code) on public.media_jobs to authenticated;
grant all on public.field_captures,public.media_jobs,public.media_results to service_role;
create trigger immutable_media_result before update or delete on public.media_results for each row execute function app_private.immutable_history();
update storage.buckets set allowed_mime_types=array['image/jpeg','image/png','image/webp','audio/wav','audio/webm','audio/mp4','text/plain'] where id='evidence';
drop policy if exists own_evidence_insert on storage.objects;
drop policy if exists own_or_planner_evidence_read on storage.objects;
create policy reserved_field_upload on storage.objects for insert to authenticated with check(
 bucket_id='evidence' and exists(select 1 from public.attachments a join public.reports r on r.id=a.report_id
 where a.object_path=name and a.state='reserved' and r.lifecycle='draft' and r.author_id=auth.uid() and app_private.is_member(r.project_id)));

create function public.reserve_field_capture(p_project uuid,p_capture uuid,p_files jsonb,p_language text) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.reports;req jsonb;f jsonb;rid uuid;
begin
 perform 1 from public.projects where id=p_project for update;
 if not app_private.is_member(p_project) then raise exception 'Project access denied' using errcode='42501';end if;
 if p_capture is null or p_language is null or p_language not in ('en','hi','auto') or jsonb_typeof(p_files) is distinct from 'array' or jsonb_array_length(p_files)>4 then raise exception 'Invalid capture' using errcode='22023';end if;
 req=jsonb_build_object('files',p_files,'language',p_language);
 select * into r from public.reports where project_id=p_project and author_id=auth.uid() and capture_id=p_capture;
 if found then
  if not exists(select 1 from public.field_captures c where c.report_id=r.id and c.request=req) then raise exception 'CAPTURE_ID_REUSED' using errcode='40001';end if;
  if r.lifecycle='withdrawn' then raise exception 'CAPTURE_DISCARDED' using errcode='22023';end if;
  return r.id;
 end if;
 if not exists(select 1 from public.projects where id=p_project and active_revision_id is not null) then raise exception 'No active plan' using errcode='22023';end if;
 if (select count(*) from public.reports where project_id=p_project and author_id=auth.uid() and lifecycle='draft')>=20 then raise exception 'TOO_MANY_DRAFTS' using errcode='22023';end if;
 if (select count(*) from jsonb_array_elements(p_files) where value->>'kind'='audio')>1 or (select count(*) from jsonb_array_elements(p_files) where value->>'kind'='photo')>3 or (select count(distinct value->>'id') from jsonb_array_elements(p_files))<>jsonb_array_length(p_files) then raise exception 'Invalid media count' using errcode='22023';end if;
 for f in select value from jsonb_array_elements(p_files) loop
  if (f->>'id')::uuid is null or f->>'kind' is null or f->>'kind' not in ('audio','photo') or coalesce(length(f->>'name'),0) not between 1 and 120 or f->>'name' ~ '[\\/]' or coalesce((f->>'bytes')::int,0) not between 1 and 5242880 or coalesce(f->>'sha256','') !~ '^[a-f0-9]{64}$' or coalesce(length(f->>'caption'),0)>500 or f->>'mime' is null
   or (f->>'kind'='audio' and f->>'mime'<>'audio/wav') or (f->>'kind'='photo' and f->>'mime' not in ('image/jpeg','image/png','image/webp')) then raise exception 'Invalid media declaration' using errcode='22023';end if;
 end loop;
 insert into public.reports(project_id,author_id,capture_id,current_version,lifecycle,source_kind)
 values(p_project,auth.uid(),p_capture,0,'draft',case when exists(select 1 from jsonb_array_elements(p_files) where value->>'kind'='audio') then 'voice' else 'text' end) returning id into rid;
 insert into public.field_captures(report_id,request) values(rid,req);
 for f in select value from jsonb_array_elements(p_files) loop
  insert into public.attachments(id,project_id,report_id,object_path,state,file_name,mime_type,byte_size,sha256,caption,media_kind,language)
  values((f->>'id')::uuid,p_project,rid,p_project::text||'/'||rid::text||'/'||(f->>'id'),'reserved',f->>'name',f->>'mime',(f->>'bytes')::int,f->>'sha256',coalesce(f->>'caption',''),f->>'kind',p_language);
 end loop;
 return rid;
end $$;

create function public.finalize_field_media(p_report uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.reports;a public.attachments;
begin
 select * into r from public.reports where id=p_report for update;
 if not found or r.author_id<>auth.uid() or not app_private.is_member(r.project_id) then raise exception 'Author required' using errcode='42501';end if;
 if r.lifecycle<>'draft' then raise exception 'CAPTURE_NOT_DRAFT' using errcode='22023';end if;
 for a in select * from public.attachments where report_id=r.id loop
  if a.state='received' then continue;end if;
  if not exists(select 1 from storage.objects o where o.bucket_id='evidence' and o.name=a.object_path and (o.metadata->>'size')::bigint=a.byte_size) then raise exception 'UPLOAD_INCOMPLETE' using errcode='22023';end if;
  insert into public.media_jobs(attachment_id) values(a.id) on conflict do nothing;
  update public.media_jobs set status='queued',error_code=null where attachment_id=a.id and status='failed' and attempts<3;
 end loop;
 return jsonb_build_object('reportId',r.id,'status','draft');
end $$;

create function public.lease_field_media() returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.media_jobs;a public.attachments;r public.reports;token uuid=gen_random_uuid();
begin
 update public.media_jobs set status='failed',error_code='media_retry_limit',lease_token=null,lease_until=null where status='running' and lease_until<now() and attempts>=3;
 select * into j from public.media_jobs where (status='queued' or (status='running' and lease_until<now())) and attempts<3 order by created_at for update skip locked limit 1;
 if not found then return null;end if;
 select * into a from public.attachments where id=j.attachment_id;
 select * into r from public.reports where id=a.report_id;
 if r.lifecycle<>'draft' or not exists(select 1 from public.project_members where project_id=r.project_id and user_id=r.author_id and active) then
  update public.media_jobs set status='failed',error_code='capture_access_changed',attempts=3 where attachment_id=a.id;return null;
 end if;
 update public.media_jobs set status='running',attempts=attempts+1,lease_token=token,lease_until=now()+interval '90 seconds' where attachment_id=a.id;
 return to_jsonb(a)||jsonb_build_object('leaseToken',token);
end $$;

create function public.complete_field_media(p_attachment uuid,p_token uuid,p_result jsonb,p_error text) returns boolean
language plpgsql security definer set search_path='' as $$
declare j public.media_jobs;a public.attachments;r public.reports;
begin
 select * into a from public.attachments where id=p_attachment;
 select * into r from public.reports where id=a.report_id for update;
 select * into j from public.media_jobs where attachment_id=p_attachment for update;
 if not found or j.status<>'running' or j.lease_token is distinct from p_token or j.lease_until<now() then return false;end if;
 if r.lifecycle<>'draft' or not exists(select 1 from public.project_members where project_id=r.project_id and user_id=r.author_id and active) then p_error='capture_access_changed';end if;
 if p_error is not null then
  update public.media_jobs set status='failed',error_code=left(p_error,100),lease_token=null,lease_until=null where attachment_id=a.id;
  return true;
 end if;
 if p_result->>'sha256' is distinct from a.sha256 or (a.media_kind='audio' and (coalesce(length(trim(p_result->>'text')),0) not between 1 and 10000 or (p_result->>'duration')::numeric not between 0.2 and 25)) then raise exception 'Invalid verified media result';end if;
 insert into public.media_results(attachment_id,original_transcript,provider,model,sha256,details) values(a.id,p_result->>'text',p_result->>'provider',p_result->>'model',a.sha256,p_result-'text');
 update public.attachments set state='received' where id=a.id;
 update public.media_jobs set status='ready',error_code=null,lease_token=null,lease_until=null where attachment_id=a.id;
 return true;
end $$;

create function public.submit_field_capture(p_report uuid,p_text text,p_work_date date,p_activity uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.reports;p public.projects;c public.field_captures;fingerprint text;media jsonb;
begin
 select * into r from public.reports where id=p_report;
 if not found or r.author_id<>auth.uid() or not app_private.is_member(r.project_id) then raise exception 'Author required' using errcode='42501';end if;
 select * into p from public.projects where id=r.project_id for update;
 select * into r from public.reports where id=p_report for update;
 if not app_private.is_member(r.project_id) then raise exception 'Access changed' using errcode='42501';end if;
 select * into c from public.field_captures where report_id=r.id;
 if not found or p.active_revision_id is null or coalesce(length(trim(p_text)),0) not between 1 and 10000 then raise exception 'Invalid capture submission' using errcode='22023';end if;
 fingerprint=encode(extensions.digest(jsonb_build_object('text',trim(p_text),'workDate',p_work_date,'activity',p_activity)::text,'sha256'),'hex');
 if r.lifecycle='submitted' then
  if c.submitted_hash is distinct from fingerprint then raise exception 'CAPTURE_ID_REUSED' using errcode='40001';end if;return r.id;
 end if;
 if r.lifecycle<>'draft' then raise exception 'CAPTURE_DISCARDED' using errcode='22023';end if;
 if p_activity is not null and not app_private.can_read_activity(p.id,p_activity) then raise exception 'Activity access denied' using errcode='42501';end if;
 if exists(select 1 from public.attachments where report_id=r.id and state<>'received') then raise exception 'MEDIA_NOT_READY' using errcode='22023';end if;
 select coalesce(jsonb_agg(jsonb_build_object('attachmentId',a.id,'kind',a.media_kind,'sha256',a.sha256,'caption',a.caption,'originalTranscript',m.original_transcript,'provider',m.provider,'model',m.model,'language',a.language) order by a.id),'[]') into media from public.attachments a join public.media_results m on m.attachment_id=a.id where a.report_id=r.id;
 insert into public.report_versions(report_id,version,source_text,work_date,selected_activity_id,content_hash,context)
 values(r.id,1,trim(p_text),p_work_date,p_activity,fingerprint,jsonb_build_object('planRevisionId',p.active_revision_id,'submissionMode','confirmed_field_capture','confirmedBy',auth.uid(),'media',media));
 update public.reports set lifecycle='submitted',current_version=1,received_at=now() where id=r.id;
 update public.field_captures set submitted_hash=fingerprint where report_id=r.id;
 insert into public.jobs(report_id,report_version) values(r.id,1);
 insert into public.admin_audit(project_id,actor,action,reason,detail) values(p.id,auth.uid()::text,'report.submitted','Reporter checked and confirmed field capture',jsonb_build_object('reportId',r.id,'hash',fingerprint,'media',media));
 return r.id;
end $$;

create function public.discard_field_capture(p_report uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare r public.reports;
begin
 select * into r from public.reports where id=p_report for update;
 if not found or r.author_id<>auth.uid() or not app_private.is_member(r.project_id) then raise exception 'Author required' using errcode='42501';end if;
 if r.current_version<>0 then raise exception 'Already submitted' using errcode='40001';end if;
 update public.reports set lifecycle='withdrawn' where id=r.id;return true;
end $$;

revoke all on function public.reserve_field_capture(uuid,uuid,jsonb,text),public.finalize_field_media(uuid),public.submit_field_capture(uuid,text,date,uuid),public.discard_field_capture(uuid) from public,anon;
grant execute on function public.reserve_field_capture(uuid,uuid,jsonb,text),public.finalize_field_media(uuid),public.submit_field_capture(uuid,text,date,uuid),public.discard_field_capture(uuid) to authenticated;
revoke all on function public.lease_field_media(),public.complete_field_media(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.lease_field_media(),public.complete_field_media(uuid,uuid,jsonb,text) to service_role;

create or replace function public.capture_text_report(p_project uuid,p_capture uuid,p_text text,p_work_date date,p_activity uuid) returns uuid
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
  if r.current_version=0 then raise exception 'MEDIA_NOT_READY' using errcode='22023';end if;
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

