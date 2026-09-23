// Submits the reports that the scripted fixture set can answer, so a demonstration can start
// from a populated review queue. Local synthetic stack only; it writes no schedule change and
// leaves every claim pending for the planner.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadFixtureSet } from '@nirmaan/adapters/fixture';
import { must, signIn } from './local-env.mjs';
import { ids } from '../fixtures/development';

const accounts = JSON.parse(readFileSync('.cache/demo-accounts.json', 'utf8'));
const fixtures = loadFixtureSet();

// Each recorded report is submitted by the reporter whose discipline it belongs to, so the
// assignment and work-front rules behave as they would for a real submission.
const reporterFor = (claims: { discipline: string | null }[]) => {
  const discipline = claims.find((c) => c.discipline)?.discipline;
  if (discipline === 'Civil') return ids.civilReporter;
  if (discipline === 'Electrical') return ids.electricalReporter;
  return ids.pipingReporter;
};

const clients = new Map<string, Awaited<ReturnType<typeof signIn>>>();
async function clientFor(memberId: string) {
  const existing = clients.get(memberId);
  if (existing) return existing;
  const account = accounts[memberId];
  if (!account) throw new Error(`No local credential for ${memberId}. Run npm run seed:local.`);
  const client = await signIn(account);
  clients.set(memberId, client);
  return client;
}

let submitted = 0;
for (const recording of fixtures.recordings) {
  const memberId = reporterFor(recording.extraction.claims);
  const client = await clientFor(memberId);
  // A stable capture ID per recorded text keeps repeat runs idempotent: capture_text_report
  // returns the original report instead of creating a duplicate.
  const captureId = `90000000-0000-4000-8000-${createHash('sha256')
    .update(recording.sourceText)
    .digest('hex')
    .slice(0, 12)}`;
  const eventDate = recording.extraction.claims.find((c) => c.eventDate)?.eventDate ?? null;
  must(
    await client.rpc('capture_text_report', {
      p_project: ids.project,
      p_capture: captureId,
      p_text: recording.sourceText,
      p_work_date: eventDate,
      p_activity: null,
    }),
  );
  submitted += 1;
}

console.log(
  `Demo reports ready: ${submitted} submitted from fixture set "${fixtures.set}". ` +
    'Start the worker with EXTRACTION_PROVIDER=fixture to process them.',
);
