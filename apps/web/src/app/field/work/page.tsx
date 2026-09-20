import { assignedActivities, formatDateOnly } from '@intelligrid/domain';
import { activities, members } from '../../../../../../fixtures/development';
export default function FieldWorkPage() {
  const assigned = assignedActivities(activities, members[0]!);
  return (
    <>
      <div className="field-greeting">
        <p className="eyebrow">ARUN SAIKIA / SAMPLE ASSIGNMENTS</p>
        <h1>My work</h1>
        <p>Planned work for the project period.</p>
      </div>
      <div className="field-work-count">
        04 activities <span>September 2026</span>
      </div>
      <div className="field-tasks">
        {assigned.map((a) => (
          <article className="field-task" key={a.id}>
            <div>
              <span className="activity-id">{a.externalId}</span>
              <span className="tag">Planned</span>
            </div>
            <h2>{a.name}</h2>
            <p>{a.location}</p>
            <div className="task-date">
              <span>
                {formatDateOnly(a.plannedStart)} – {formatDateOnly(a.plannedFinish)}
              </span>
              <span>
                {a.targetQuantity} {a.unit}
              </span>
            </div>
          </article>
        ))}
      </div>
      <div className="field-callout">
        <strong>Assigned work can change.</strong>
        <p>
          If your supervisor sends you to another location, the reporting flow will preserve your
          update and request verification.
        </p>
      </div>
      <p className="field-disclaimer">
        Assignments are synthetic. Planned dates do not indicate actual completion.
      </p>
    </>
  );
}
