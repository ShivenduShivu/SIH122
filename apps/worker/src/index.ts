import { pipelineVersion } from '@intelligrid/contracts';

if (!process.argv.includes('--check')) {
  throw new Error(
    'Phase 1 only supports --check. The database job consumer is implemented in Phase 3.',
  );
}
console.log(
  JSON.stringify({
    service: 'worker',
    mode: 'configuration-check',
    pipelineVersion,
    consumesJobs: false,
  }),
);
