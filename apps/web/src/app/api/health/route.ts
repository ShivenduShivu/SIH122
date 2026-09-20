export function GET() {
  return Response.json(
    {
      service: 'intelligrid-web',
      status: 'ok',
      phase: 3,
      mode: 'authenticated-synthetic-project',
      check: 'web-process-liveness',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
