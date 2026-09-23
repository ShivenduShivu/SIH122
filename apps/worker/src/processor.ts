import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { rankClaim } from '@nirmaan/domain/matching';
import { PlannedActivity } from '@nirmaan/contracts';
import { readComplete } from './read-complete';
import { Extraction } from '@nirmaan/contracts/reports';
import { ProviderError, type Extractor } from '@nirmaan/adapters';
const must = <T>(r: {
  data: T;
  error: { message: string } | null;
  count?: number | null;
}): NonNullable<T> => {
  if (r.error) throw new Error(r.error.message);
  if (Array.isArray(r.data) && r.count != null && r.count > r.data.length)
    throw new ProviderError('catalog_requires_pagination', false);
  return r.data as NonNullable<T>;
};
export function workerDatabase(url: string, key: string) {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function processOne(db: SupabaseClient, extractor: Extractor): Promise<boolean> {
  const job = must(await db.rpc('lease_report_job'));
  if (!job) return false;
  let lost = false;
  const heartbeat = setInterval(() => {
    void db.rpc('heartbeat_report_job', { p_job: job.id, p_token: job.lease_token }).then((r) => {
      if (r.error || !r.data) lost = true;
    });
  }, 20000);
  try {
    const report = must(await db.from('reports').select('*').eq('id', job.report_id).single());
    const version = must(
      await db
        .from('report_versions')
        .select('*')
        .eq('report_id', job.report_id)
        .eq('version', job.report_version)
        .single(),
    );
    let runId = job.run_id;
    if (!runId) {
      const result = await extractor.extract({
        sourceText: version.source_text,
        workDate: version.work_date,
        sourceEnvelope: version.context?.sourceEnvelope,
      });
      if (lost) throw new Error('LEASE_LOST');
      runId = must(
        await db.rpc('record_extraction', {
          p_job: job.id,
          p_token: job.lease_token,
          p_result: result,
        }),
      );
    }
    const run = must(await db.from('processing_runs').select('output').eq('id', runId).single());
    const extraction = Extraction.parse(run.output);
    if (extraction.overflow) throw new ProviderError('manual_review_event_overflow', false);
    const project = must(
      await db.from('projects').select('*').eq('id', report.project_id).single(),
    );
    // Worker performs planner reconciliation only inside the report's project. No plan is sent to the provider.
    const plans = await readComplete((from, to) =>
      db
        .from('activity_plan_versions')
        .select('*', { count: 'exact' })
        .eq('project_id', project.id)
        .eq('revision_id', project.active_revision_id)
        .order('activity_id')
        .range(from, to),
    );
    const activityRows = await readComplete((from, to) =>
      db
        .from('activities')
        .select('*', { count: 'exact' })
        .eq('project_id', project.id)
        .eq('active', true)
        .order('id')
        .range(from, to),
    );
    const assignments = await readComplete((from, to) =>
      db
        .from('assignment_versions')
        .select('*', { count: 'exact' })
        .eq('project_id', project.id)
        .order('activity_id')
        .order('version', { ascending: false })
        .range(from, to),
    );
    const catalog = plans
      .filter((p) =>
        activityRows.some(
          (a) =>
            a.id === p.activity_id &&
            (!version.context?.contractorId || a.contractor_id === version.context.contractorId),
        ),
      )
      .map((p) =>
        PlannedActivity.parse({
          id: p.activity_id,
          projectId: project.id,
          revisionId: p.revision_id,
          externalId: activityRows.find((a) => a.id === p.activity_id)!.external_id,
          name: p.name,
          discipline: p.discipline,
          location: p.location,
          stage: p.stage,
          plannedStart: p.planned_start,
          plannedFinish: p.planned_finish,
          targetQuantity: p.target_quantity,
          unit: p.unit,
          nodeKind: p.node_kind,
          hierarchyPath: p.source_metadata?.hierarchyPath ?? [],
          sourceLevel: p.source_metadata?.sourceLevel ?? null,
          sourceWbs: p.source_metadata?.sourceWbs ?? null,
          sourceDiscipline: p.source_metadata?.sourceDiscipline ?? null,
          duration: p.source_metadata?.duration ?? null,
          predecessors: p.source_metadata?.predecessors ?? '',
          calendar: p.source_metadata?.calendar ?? 'Source calendar not specified',
          assignedReporterId:
            assignments.find((a) => a.activity_id === p.activity_id)?.reporter_id ?? null,
        }),
      );
    const claims = extraction.claims.map((c) =>
      rankClaim(c, catalog, {
        authorId: report.author_id,
        selectedActivityId: version.selected_activity_id,
      }),
    );
    must(
      await db.rpc('finish_report_job', {
        p_job: job.id,
        p_token: job.lease_token,
        p_revision: project.active_revision_id,
        p_policy: project.policy_version,
        p_claims: claims,
      }),
    );
    console.log(JSON.stringify({ jobId: job.id, status: 'succeeded', claims: claims.length }));
  } catch (error) {
    const code = error instanceof ProviderError ? error.code : 'processing_failed';
    const retry = error instanceof ProviderError ? error.retryable : true;
    const delay = Math.max(
      error instanceof ProviderError ? error.retryAfter : 0,
      Math.min(300, 2 ** job.attempts * 5) + Math.random() * 5,
    );
    const saved = await db.rpc('fail_report_job', {
      p_job: job.id,
      p_token: job.lease_token,
      p_code: code,
      p_retry: retry,
      p_delay: Math.ceil(delay),
    });
    console.error(
      JSON.stringify({
        jobId: job.id,
        status: saved.error ? 'lease_lost' : 'failed_or_retry_wait',
        code,
      }),
    );
  } finally {
    clearInterval(heartbeat);
  }
  return true;
}
