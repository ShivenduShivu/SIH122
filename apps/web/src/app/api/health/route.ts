export function GET() {
  return Response.json(
    {
      service: 'intelligrid-web',
      status: 'ok',
      phase: 1,
      mode: 'synthetic-preview',
      databaseConnected: false,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
