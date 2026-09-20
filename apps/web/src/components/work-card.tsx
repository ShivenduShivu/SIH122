import type { PlannedActivity } from '@intelligrid/contracts';
import { formatDateOnly } from '@intelligrid/domain';
import type { ScheduleActivity } from '@intelligrid/contracts/reports';
export function WorkCard({
  activity: a,
  assignment: x,
}: {
  activity: PlannedActivity &
    Partial<
      Pick<
        ScheduleActivity,
        | 'actualStart'
        | 'actualFinish'
        | 'acceptedQuantity'
        | 'acceptedPercent'
        | 'percentBasis'
        | 'reportedProgress'
        | 'milestoneDate'
      >
    >;
  assignment: { effective_from: string; effective_to: string; version: number };
}) {
  return (
    <article className="field-task">
      <div>
        <span className="activity-id">
          {a.externalId} · {a.discipline}
        </span>
        <span className="tag">
          {a.actualFinish
            ? 'Complete'
            : a.actualStart
              ? 'In progress'
              : a.reportedProgress
                ? 'Progress reported · start unresolved'
                : 'Assigned'}
        </span>
      </div>
      <h2>{a.name}</h2>
      <p>{a.location}</p>
      <div className="task-date">
        <span>
          {formatDateOnly(x.effective_from)} – {formatDateOnly(x.effective_to)}
        </span>
        <span>
          {a.targetQuantity === null
            ? a.nodeKind === 'milestone'
              ? 'Milestone'
              : 'Quantity not specified'
            : `${a.targetQuantity} ${a.unit} planned`}
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
      {a.acceptedPercent != null && (
        <p>
          Accepted progress: {a.acceptedPercent}% · {a.percentBasis}
        </p>
      )}
      {a.milestoneDate && <p>Milestone recorded: {formatDateOnly(a.milestoneDate)}</p>}
    </article>
  );
}
