export function GET() {
  return Response.json(
    {
      service: 'nirmaan-web',
      status: 'ok',
      pipelineVersion: 'observations-v2',
      mode: 'authenticated-synthetic-project',
      check: 'web-process-liveness',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
