import 'server-only';
import { cache } from 'react';
import { projectContext } from './project';
import { readRows } from './read-rows';
export const followupWorkbench = cache(async () => {
  const c = await projectContext();
  const load = (table: string) =>
    readRows((from, to) =>
      c.db
        .from(table)
        .select('*', { count: 'exact' })
        .eq('project_id', c.project.id)
        .order('id')
        .range(from, to),
    );
  const [questions, responses, verifications, decisions, attachments] = await Promise.all(
    [
      'clarification_requests',
      'clarification_responses',
      'verification_requests',
      'verification_decisions',
      'attachments',
    ].map(load),
  );
  return {
    questions: questions!.sort((a, b) => a.created_at.localeCompare(b.created_at)),
    responses: responses!,
    verifications: verifications!.sort((a, b) => b.created_at.localeCompare(a.created_at)),
    decisions: decisions!,
    attachments: attachments!,
  };
});
