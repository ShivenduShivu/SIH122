export function reportStatus(
  reportId: string,
  claims: Array<{ report_id: string; state: string }>,
  jobs: Array<{ report_id: string; status: string; error_code?: string | null }>,
) {
  const rows = claims.filter((c) => c.report_id === reportId && c.state !== 'superseded');
  if (jobs.some((j) => j.report_id === reportId && j.error_code === 'report_withdrawn'))
    return 'Withdrawn';
  if (rows.length) {
    if (rows.every((c) => c.state === 'withdrawn')) return 'Withdrawn';
    if (rows.some((c) => c.state === 'disputed')) return 'Needs planner attention';
    if (rows.some((c) => c.state === 'clarification')) return 'Answer needed';
    if (rows.some((c) => c.state === 'verification')) return 'Supervisor check';
    if (rows.every((c) => c.state === 'accepted')) return 'Accepted';
    if (rows.some((c) => c.state === 'accepted')) return 'Partly accepted';
    if (rows.every((c) => c.state === 'rejected')) return 'Rejected';
    if (rows.every((c) => c.state === 'unplanned')) return 'Kept as unplanned';
    return 'Needs review';
  }
  const job = jobs.find((j) => j.report_id === reportId);
  return job?.status === 'failed'
    ? 'Processing needs attention'
    : job?.status === 'retry_wait'
      ? 'Waiting to retry'
      : 'Processing report';
}
