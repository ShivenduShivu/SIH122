import { pathToFileURL } from 'node:url';
import { providerConfiguration } from '../packages/adapters/src/provider-config.mjs';
export function checkDeployment(env) {
  const errors = [];
  for (const name of ['APP_ORIGIN', 'NEXT_PUBLIC_SUPABASE_URL']) {
    try {
      const url = new URL(env[name]);
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.origin !== env[name] ||
        ['localhost', '127.0.0.1', '::1'].includes(url.hostname) ||
        url.hostname.endsWith('.example.org')
      )
        errors.push(`${name}: use a real HTTPS origin without a trailing slash`);
    } catch {
      errors.push(`${name}: invalid URL`);
    }
  }
  for (const name of ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
    if (!env[name] || env[name].startsWith('replace-'))
      errors.push(`${name}: configure this value`);
  }
  try {
    providerConfiguration(env);
  } catch (error) {
    errors.push(error.message);
  }
  if (env.WORKER_MAX_CONSECUTIVE_FAILURES !== undefined) {
    const failureLimit = Number(env.WORKER_MAX_CONSECUTIVE_FAILURES);
    if (!Number.isSafeInteger(failureLimit) || failureLimit < 1)
      errors.push('WORKER_MAX_CONSECUTIVE_FAILURES: use a positive safe integer');
  }
  const publicKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
  if (
    publicKey.startsWith('sb_secret_') ||
    publicKey.startsWith('sk-') ||
    (publicKey &&
      [
        env.SUPABASE_SERVICE_ROLE_KEY,
        env.OPENAI_API_KEY,
        env.GEMINI_API_KEY,
        env.ANTHROPIC_API_KEY,
        env.OPENROUTER_API_KEY,
      ].includes(publicKey))
  )
    errors.push('Public key must not contain a private credential');
  if (!publicKey.startsWith('sb_publishable_')) {
    try {
      if (JSON.parse(Buffer.from(publicKey.split('.')[1], 'base64url')).role !== 'anon')
        errors.push('Legacy public JWT must have anon role');
    } catch {
      errors.push('Public key must be a publishable key or anon JWT');
    }
  }
  return errors;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = checkDeployment(process.env);
  for (const error of errors) console.error(error); // Names/reasons only, never values.
  console.log(
    errors.length
      ? 'Deployment configuration incomplete.'
      : 'Configuration shape passed; credentials, migrations, TLS and provider connectivity still require live checks.',
  );
  process.exitCode = errors.length ? 1 : 0;
}
