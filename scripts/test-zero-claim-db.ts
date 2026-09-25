import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ids } from '../fixtures/development';
import { processOne } from '../apps/worker/src/processor';
import { admin, assertQueueDrained, must, signIn } from './local-env.mjs';

await assertQueueDrained();
const accounts = JSON.parse(readFileSync('.cache/demo-accounts.json', 'utf8'));
const planner = await signIn(accounts[ids.planner]);
const reportId = must(
  await planner.rpc('capture_text_report', {
    p_project: ids.project,
    p_capture: randomUUID(),
    p_text: 'No construction progress was reported in this device check.',
    p_work_date: null,
    p_activity: null,
  }),
);
assert.equal(
  await processOne(admin, {
    async extract() {
      return {
        provider: 'test-fixture',
        model: 'no-event-test',
        promptHash: 'test',
        inputHash: 'test',
        output: { claims: [], overflow: false },
        raw: { fixture: true },
        usage: {},
        latencyMs: 0,
      };
    },
  }),
  true,
);
const job = must(
  await admin.from('jobs').select('status,claim_count').eq('report_id', reportId).single(),
);
assert.equal(job.status, 'succeeded');
assert.equal(job.claim_count, 0);
const claims = must(await admin.from('claims').select('id').eq('report_id', reportId));
assert.equal(claims.length, 0);
console.log('PASS no-event report completed with zero claims and no schedule decision');
