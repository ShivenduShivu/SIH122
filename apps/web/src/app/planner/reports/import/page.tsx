import { plannerContext } from '../../../../lib/project';

import { FieldImport } from '../../../../components/field-import';

export default async function FieldImportPage() {
  const { db, project } = await plannerContext();
  const [members, imports] = await Promise.all([
    db
      .from('project_members')
      .select('contractor_id,display_name')
      .eq('project_id', project.id)
      .eq('active', true)
      .not('contractor_id', 'is', null),
    db
      .from('schedule_imports')
      .select('id,created_at,status,files')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);
  if (members.error || imports.error) throw new Error('Could not load import context');
  return (
    <FieldImport
      projectId={project.id}
      contractors={[
        ...new Map(
          members.data.map((m) => [
            m.contractor_id,
            { id: m.contractor_id, label: `Contractor scope · ${m.display_name}` },
          ]),
        ).values(),
      ]}
      history={imports.data.filter((i) => i.files[0]?.profile === 'field_corpus')}
    />
  );
}
