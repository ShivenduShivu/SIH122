import { readFileSync } from 'node:fs';
try {
  const heartbeat = JSON.parse(
    readFileSync(
      process.env.WORKER_HEARTBEAT_PATH ?? '/tmp/intelligrid-worker-heartbeat.json',
      'utf8',
    ),
  );
  const age = Date.now() - Date.parse(heartbeat.completedAt);
  if (!Number.isFinite(age) || age < 0 || age > 180_000) process.exit(1);
} catch {
  process.exit(1);
}
