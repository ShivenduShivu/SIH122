import type { PlannedActivity } from '@intelligrid/contracts';
import { formatDateOnly } from '@intelligrid/domain';
export function WorkCard({
  activity: a,
  assignment: x,
}: {
  activity: PlannedActivity;
  assignment: { effective_from: string; effective_to: string; version: number };
}) {
  return (
    <article className="field-task">
      <div>
        <span className="activity-id">
          {a.externalId} · {a.discipline}
        </span>
        <span className="tag">Assigned</span>
      </div>
      <h2>{a.name}</h2>
      <p>{a.location}</p>
      <div className="task-date">
        <span>
          {formatDateOnly(x.effective_from)} – {formatDateOnly(x.effective_to)}
        </span>
        <span>
          {a.targetQuantity} {a.unit} planned
        </span>
      </div>
      <div className="task-evidence">No accepted progress recorded · Assignment v{x.version}</div>
    </article>
  );
}
