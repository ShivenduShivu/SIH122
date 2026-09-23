-- Recover interrupted work first, then keep reporter follow-ups and live field
-- reports ahead of bulk spreadsheet imports. Within each lane, retain FIFO order.
create or replace function public.lease_report_job() returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.jobs;
begin
 update public.jobs
 set status='failed',error_code='attempts_exhausted',lease_token=null,lease_until=null
 where status='running' and lease_until<now() and attempts>=4;

 select queued.* into j
 from public.jobs queued
 join public.reports report on report.id=queued.report_id
 join public.report_versions version
   on version.report_id=queued.report_id and version.version=queued.report_version
 where queued.attempts<4
   and (
    (queued.status in ('queued','retry_wait') and queued.next_run_at<=now())
    or (queued.status='running' and queued.lease_until<now())
   )
 order by
  case
   when queued.status='running' then 0
   when version.context->>'submissionMode'='structured_reply' then 1
   when report.source_kind in ('text','voice') then 2
   when queued.run_id is not null then 3
   else 4
  end,
  queued.created_at,
  queued.id
 for update of queued skip locked
 limit 1;

 if not found then return null; end if;
 update public.jobs
 set status='running',attempts=attempts+1,lease_token=gen_random_uuid(),
     lease_until=now()+interval '120 seconds',error_code=null
 where id=j.id
 returning * into j;
 return to_jsonb(j);
end $$;

revoke all on function public.lease_report_job() from public,anon,authenticated;
grant execute on function public.lease_report_job() to service_role;
