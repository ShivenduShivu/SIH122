import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const suffix = `${process.pid}-${Date.now()}`;
const webImage = `intelligrid-web-test:${suffix}`;
const workerImage = `intelligrid-worker-test:${suffix}`;
const webContainer = `intelligrid-web-test-${suffix}`;
const appOrigin = 'https://deploy.intelligrid.test';
const publicUrl = 'https://project.supabase.co';
const publicKey = 'sb_publishable_container_test';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
  });
  if (result.status !== 0) {
    const detail = options.capture ? `\n${result.stdout}\n${result.stderr}` : '';
    throw new Error(`${command} ${args.join(' ')} failed with ${result.status}${detail}`);
  }
  return result.stdout?.trim() ?? '';
}

async function waitForHealth(baseUrl) {
  let lastError;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return response;
      lastError = new Error(`Health returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError ?? new Error('Web container did not become healthy');
}

try {
  run('docker', [
    'build',
    '--target',
    'web',
    '--build-arg',
    `APP_ORIGIN=${appOrigin}`,
    '--build-arg',
    `NEXT_PUBLIC_SUPABASE_URL=${publicUrl}`,
    '--build-arg',
    `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${publicKey}`,
    '--tag',
    webImage,
    '--file',
    'deploy/Dockerfile',
    '.',
  ]);
  run('docker', [
    'run',
    '--detach',
    '--rm',
    '--name',
    webContainer,
    '--publish',
    '127.0.0.1::3000',
    '--env',
    `APP_ORIGIN=${appOrigin}`,
    '--env',
    `NEXT_PUBLIC_SUPABASE_URL=${publicUrl}`,
    '--env',
    `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${publicKey}`,
    webImage,
  ]);
  const published = run('docker', ['port', webContainer, '3000/tcp'], { capture: true });
  const port = published.match(/:(\d+)$/)?.[1];
  assert.ok(port, `Could not parse published port from ${published}`);
  const baseUrl = `http://127.0.0.1:${port}`;
  const health = await waitForHealth(baseUrl);
  assert.equal(
    health.headers.get('strict-transport-security'),
    'max-age=31536000; includeSubDomains',
    'HTTPS deployments must emit HSTS from the built web image',
  );
  assert.equal(health.headers.get('x-frame-options'), 'DENY');
  const login = await fetch(`${baseUrl}/login`);
  assert.equal(login.status, 200);
  assert.match(await login.text(), /Sign in/);

  run('docker', [
    'build',
    '--target',
    'worker',
    '--tag',
    workerImage,
    '--file',
    'deploy/Dockerfile',
    '.',
  ]);
  const workerCheck = run(
    'docker',
    [
      'run',
      '--rm',
      '--env',
      'EXTRACTION_PROVIDER=fixture',
      workerImage,
      'node',
      'node_modules/tsx/dist/cli.mjs',
      'apps/worker/src/index.ts',
      '--check',
    ],
    { capture: true },
  );
  assert.equal(JSON.parse(workerCheck).provider, 'fixture');
  const workerBytes = Number(
    run('docker', ['image', 'inspect', '--format', '{{.Size}}', workerImage], { capture: true }),
  );
  assert.ok(workerBytes < 500_000_000, `Worker image is ${workerBytes} bytes; expected <500 MB`);
  console.log(
    `PASS deployment containers: HSTS/login/health and worker image ${workerBytes} bytes.`,
  );
} finally {
  spawnSync('docker', ['rm', '--force', webContainer], { stdio: 'ignore' });
  spawnSync('docker', ['image', 'rm', '--force', webImage, workerImage], { stdio: 'ignore' });
}
