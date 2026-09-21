import { describe, expect, it } from 'vitest';
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
