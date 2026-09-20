import { projectContext } from '../lib/project';
export async function ProjectSwitcher() {
  const { db, project, members } = await projectContext();
  if (members.length < 2) return null;
  const { data, error } = await db.from('projects').select('id,name').order('name');
  if (error) throw new Error('Could not load your projects.');
  return (
    <form className="project-switch" action="/api/projects" method="post">
      <label htmlFor="active-project">Active project</label>
      <select id="active-project" name="projectId" defaultValue={project.id}>
        {data?.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <button className="button">Switch project</button>
    </form>
  );
}
