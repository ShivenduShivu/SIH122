import { spawn } from 'node:child_process';
import { execSync } from 'node:child_process';

function checkSupabase() {
  try {
    const out = execSync('docker ps --format "{{.Names}}"', { encoding: 'utf8' });
    const up = out.includes('supabase_db_nirmaan') && out.includes('supabase_kong_nirmaan');
    if (!up) {
      console.warn(
        '[dev-all] Supabase containers are not running. Start them first: see docs/local-development.md.',
      );
    }
  } catch {
    console.warn('[dev-all] Could not check Docker; make sure Supabase is running.');
  }
}

function run(name, command, args) {
  const child = spawn(command, args, { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const prefix = `[${name}]`;
  for (const stream of [child.stdout, child.stderr]) {
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) console.log(`${prefix} ${line}`);
    });
  }
  child.on('exit', (code) => {
    console.log(`${prefix} exited with code ${code}`);
  });
  return child;
}

checkSupabase();

const web = run('web', 'npm', ['run', 'dev', '--workspace=@nirmaan/web']);
const worker = run('worker', 'npm', ['run', 'worker:start']);

function shutdown() {
  console.log('\n[dev-all] Shutting down web and worker...');
  web.kill();
  worker.kill();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
