import { describe, expect, it, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { workerFailureLimit } from '../apps/worker/src/supervision';
// @ts-expect-error operator CLI is intentionally JavaScript
import { checkDeployment } from '../scripts/deploy-preflight.mjs';
describe('deployment credential boundary', () => {
  const valid = {
    APP_ORIGIN: 'https://demo.intelligrid.test',
    NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
    SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_fixture',
    OPENAI_API_KEY: 'sk-fixture',
  };
  it('allows a separated HTTPS configuration shape', () =>
    expect(checkDeployment(valid)).toEqual([]));
  it('accepts Gemini-only configuration and catches every private key in a public slot', () => {
    const gemini = {
      ...valid,
      OPENAI_API_KEY: '',
      EXTRACTION_PROVIDER: 'gemini',
      GEMINI_API_KEY: 'gemini-fixture',
      GEMINI_MODEL: 'model-fixture',
    };
    expect(checkDeployment(gemini)).toEqual([]);
    for (const key of ['GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY']) {
      const errors = checkDeployment({
        ...gemini,
        [key]: 'private-fixture',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'private-fixture',
      });
      expect(errors.join(' ')).toContain('private credential');
      expect(errors.join(' ')).not.toContain('private-fixture');
    }
  });
  it('rejects a service-role JWT in the browser key', () => {
    const jwt = `header.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.signature`;
    expect(
      checkDeployment({ ...valid, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: jwt }).join(' '),
    ).toContain('anon role');
  });
  it('rejects private-key aliases without printing secrets', () => {
    const errors = checkDeployment({
      ...valid,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: valid.OPENAI_API_KEY,
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join(' ')).not.toContain(valid.OPENAI_API_KEY);
  });
  it('rejects HTTP, embedded credentials and origin path mismatches', () => {
    for (const APP_ORIGIN of [
      'http://demo.test',
      'https://a:b@demo.test',
      'https://demo.test/field',
      'https://demo.test/',
    ])
      expect(checkDeployment({ ...valid, APP_ORIGIN }).length).toBeGreaterThan(0);
  });
  it('rejects a non-positive worker failure limit', () => {
    expect(checkDeployment({ ...valid, WORKER_MAX_CONSECUTIVE_FAILURES: '0' }).join(' ')).toContain(
      'WORKER_MAX_CONSECUTIVE_FAILURES',
    );
  });
  it('rejects a worker failure limit larger than a safe integer', () => {
    expect(
      checkDeployment({ ...valid, WORKER_MAX_CONSECUTIVE_FAILURES: '9'.repeat(400) }).join(' '),
    ).toContain('WORKER_MAX_CONSECUTIVE_FAILURES');
  });
});

describe('worker supervision configuration', () => {
  it('uses the default for unsafe failure limits', () => {
    expect(workerFailureLimit('9'.repeat(400))).toBe(12);
  });
});

describe('transport security headers', () => {
  async function headerKeys(appOrigin: string | undefined) {
    vi.resetModules();
    const previous = process.env.APP_ORIGIN;
    if (appOrigin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = appOrigin;
    try {
      const config = (await import('../apps/web/next.config')).default;
      const groups = await config.headers!();
      return groups.flatMap((group) => group.headers.map((header) => header.key));
    } finally {
      if (previous === undefined) delete process.env.APP_ORIGIN;
      else process.env.APP_ORIGIN = previous;
    }
  }
  it('pins HSTS only for an HTTPS deployment origin', async () => {
    expect(await headerKeys('https://demo.intelligrid.test')).toContain(
      'Strict-Transport-Security',
    );
  });
  it('never pins HSTS for local HTTP or an unset origin', async () => {
    expect(await headerKeys('http://localhost:3000')).not.toContain('Strict-Transport-Security');
    expect(await headerKeys(undefined)).not.toContain('Strict-Transport-Security');
  });
});

describe('worker supervision boundary', () => {
  it('exits non-zero after the configured number of consecutive loop failures', async () => {
    const result = await new Promise<{ code: number | null; stderr: string }>((resolve) => {
      const child = spawn(
        process.execPath,
        ['node_modules/tsx/dist/cli.mjs', 'apps/worker/src/index.ts'],
        {
          cwd: new URL('..', import.meta.url),
          env: {
            ...process.env,
            SUPABASE_URL: 'http://127.0.0.1:1',
            SUPABASE_SERVICE_ROLE_KEY: 'test-only-key',
            EXTRACTION_PROVIDER: 'fixture',
            WORKER_MAX_CONSECUTIVE_FAILURES: '1',
          },
          stdio: ['ignore', 'ignore', 'pipe'],
        },
      );
      let stderr = '';
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
      const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
      child.on('exit', (code) => {
        clearTimeout(timer);
        resolve({ code, stderr });
      });
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('loop_failed');
    expect(result.stderr).toContain('stopped_after_failures');
  }, 5000);
});
