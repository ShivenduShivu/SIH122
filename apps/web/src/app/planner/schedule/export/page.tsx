import { plannerContext } from '../../../../lib/project';
import { PlannerExchange } from '../../../../components/planner-exchange';
export default async function ExportPage() {
  const { db, project } = await plannerContext();
  const result = await db
    .from('planner_exports')
    .select('id,manifest,created_at')
    .eq('project_id', project.id)
    .order('created_at', { ascending: false })
    .limit(30);
  if (result.error) throw new Error('Could not load export register.');
  return (
    <>
      <PlannerExchange history={result.data} />
    </>
  );
}
