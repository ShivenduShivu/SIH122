import { readFileSync } from 'node:fs';
import { admin, must } from './local-env.mjs';
// Input is an operator-owned JSON file, never an HTTP body or browser role switch.
const file = process.argv[2];
if (!file)
  throw new Error(
    'Usage: npm run admin:member -- path/to/change.json (see docs/local-development.md)',
  );
const command = JSON.parse(readFileSync(file, 'utf8'));
const required = ['p_project', 'p_user', 'p_expected_version', 'p_member', 'p_actor', 'p_reason'];
if (
  required.some((k) => command[k] === undefined) ||
  Object.keys(command).some((k) => !required.includes(k))
)
  throw new Error('Invalid membership command fields');
const version = must(await admin.rpc('set_project_member', command));
console.log(`Membership command applied. New version: ${version}. Audit record retained.`);
