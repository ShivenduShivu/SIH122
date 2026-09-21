import { describe, expect, it, vi } from 'vitest';
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
