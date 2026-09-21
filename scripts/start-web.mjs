import { cpSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
const root = resolve(import.meta.dirname, '..');
const app = resolve(root, 'apps/web');
if (existsSync(`${app}/.env.local`)) process.loadEnvFile(`${app}/.env.local`);
const destination = `${app}/.next/standalone/apps/web`;
if (!existsSync(`${destination}/server.js`)) throw new Error('Run npm run build before npm start.');
cpSync(`${app}/public`, `${destination}/public`, { recursive: true });
cpSync(`${app}/.next/static`, `${destination}/.next/static`, { recursive: true });
const webEnvironment = { ...process.env };
for (const key of Object.keys(webEnvironment)) {
  if (/^(OPENAI_|GEMINI_|ANTHROPIC_|OPENROUTER_)/.test(key) || key === 'SUPABASE_SERVICE_ROLE_KEY')
    delete webEnvironment[key];
}
const child = spawn(process.execPath, [`${destination}/server.js`], {
  cwd: root,
  stdio: 'inherit',
  env: { ...webEnvironment, HOSTNAME: '127.0.0.1', PORT: process.env.PORT ?? '3000' },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
