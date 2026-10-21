import { describe, expect, it } from 'vitest';
import { parseDemoAccounts, demoRoleSlug } from '../apps/web/src/lib/demo-accounts';

const valid = [
  { role: 'Planner', email: 'planner.demo@nirmaan.example.test', password: 'x', note: 'Full view' },
];
const json = (v: unknown) => JSON.stringify(v);

describe('published demonstration accounts', () => {
  it('is absent by default, so an ordinary deployment publishes nothing', () => {
    for (const raw of [undefined, '', '   '])
      expect(parseDemoAccounts(raw)).toEqual({ accounts: [], error: null });
  });
  it('accepts a reserved-domain account', () => {
    const { accounts, error } = parseDemoAccounts(json(valid));
    expect(error).toBeNull();
    expect(accounts).toEqual(valid);
  });
  it('accepts every reserved domain form', () => {
    for (const email of [
      'a@demo.test',
      'a@nirmaan.example',
      'a@x.invalid',
      'a@example.com',
      'a@example.org',
    ])
      expect(parseDemoAccounts(json([{ ...valid[0], email }])).accounts).toHaveLength(1);
  });
  it('refuses a real mailbox, which is the point of the rule', () => {
    for (const email of [
      'laterabhi1@gmail.com',
      'someone@oilindia.in',
      'a@nirmaan.example.test.evil.com',
    ]) {
      const { accounts, error } = parseDemoAccounts(json([{ ...valid[0], email }]));
      expect(accounts).toEqual([]);
      expect(error).toBeTruthy();
    }
  });
  it('never echoes the supplied value, which carries the passwords', () => {
    const secret = 'super-secret-password';
    const { error } = parseDemoAccounts(
      json([{ ...valid[0], email: 'me@gmail.com', password: secret }]),
    );
    expect(error).not.toContain(secret);
    expect(error).not.toContain('me@gmail.com');
  });
  it('rejects malformed input without throwing', () => {
    expect(parseDemoAccounts('{oops').accounts).toEqual([]);
    expect(parseDemoAccounts('{oops').error).toBe('DEMO_ACCOUNTS is not valid JSON');
    expect(parseDemoAccounts(json([{ role: 'Planner' }])).accounts).toEqual([]);
    expect(parseDemoAccounts(json([{ ...valid[0], extra: 1 }])).accounts).toEqual([]);
  });
  it('caps how many accounts a page may publish', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({
      ...valid[0],
      email: `demo${i}@nirmaan.example.test`,
    }));
    expect(parseDemoAccounts(json(many)).accounts).toEqual([]);
  });
});

describe('demo role slugs', () => {
  it('produces a stable identifier the sign-in button can post', () => {
    expect(demoRoleSlug('Project manager')).toBe('project-manager');
    expect(demoRoleSlug('Field reporter')).toBe('field-reporter');
    expect(demoRoleSlug('  Planner  ')).toBe('planner');
  });
  it('keeps the four configured roles distinct', () => {
    const roles = ['Project manager', 'Planner', 'Supervisor', 'Field reporter'];
    expect(new Set(roles.map(demoRoleSlug)).size).toBe(4);
  });
  it('never emits a slug that could collide with an empty post', () => {
    expect(demoRoleSlug('!!!')).toBe('');
    expect(demoRoleSlug('a!b')).toBe('a-b');
  });
});
