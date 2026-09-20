import type { PlannedActivity } from '@intelligrid/contracts';
import { formatDateOnly } from '@intelligrid/domain';
import type { ScheduleActivity } from '@intelligrid/contracts/reports';
export function WorkCard({
  activity: a,
  assignment: x,
}: {
  activity: PlannedActivity &
    Partial<Pick<ScheduleActivity, 'actualStart' | 'actualFinish' | 'acceptedQuantity'>>;
  assignment: { effective_from: string; effective_to: string; version: number };
}) {
  return (
    <article className="field-task">
      <div>
        <span className="activity-id">
          {a.externalId} · {a.discipline}
        </span>
        <span className="tag">
          {a.actualFinish ? 'Complete' : a.actualStart ? 'In progress' : 'Assigned'}
        </span>
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
      <div className="task-evidence">
        {a.acceptedQuantity === undefined
          ? 'Progress unavailable'
          : a.acceptedQuantity === 0
            ? 'No quantity recorded'
            : `${a.acceptedQuantity} / ${a.targetQuantity} ${a.unit} accepted`}{' '}
        · Assignment v{x.version}
      </div>
    </article>
  );
}
