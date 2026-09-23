import { plannerContext } from '../../../lib/project';
import { AcceptedHistory } from '../../../components/accepted-history';
export default async function HistoryPage() {
  const { db, project, user } = await plannerContext();
  const result = await db.rpc('execution_history', { p_project: project.id });
  if (result.error) throw new Error('Could not load complete accepted execution history.');
  return (
    <>
      <AcceptedHistory
        key={`${user.id}:${project.id}`}
        entries={result.data}
        storageKey={`nirmaan:history:v1:${user.id}:${project.id}`}
      />
    </>
  );
}
