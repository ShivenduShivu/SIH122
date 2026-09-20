export function reportStatus(
  reportId: string,
  claims: Array<{ report_id: string; state: string }>,
  jobs: Array<{ report_id: string; status: string }>,
) {
  const rows = claims.filter((c) => c.report_id === reportId);
  if (rows.length) {
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
