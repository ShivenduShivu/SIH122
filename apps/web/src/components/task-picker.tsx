'use client';
import { useState } from 'react';
export type ReportTask = { id: string; externalId: string; name: string; location: string };

export function TaskPicker({
  tasks,
  value,
  disabled,
  onChange,
}: {
  tasks: ReportTask[];
  value: string;
  disabled: boolean;
  onChange: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const selected = tasks.find((task) => task.id === value);
  const query = search.trim().toLocaleLowerCase();
  const matches = tasks.filter((task) =>
    `${task.externalId} ${task.name} ${task.location}`.toLocaleLowerCase().includes(query),
  );
  return (
    <details className="task-picker">
      <summary>
        Related task <span className="muted">(optional)</span>
        {selected && (
          <strong>
            {selected.externalId} · {selected.name}
          </strong>
        )}
      </summary>
      <p className="field-explanation">
        Link a task if you know it. You can leave this blank and the planner will match your report.
      </p>
      {tasks.length ? (
        <>
          {value && (
            <button
              type="button"
              className="text-button"
              disabled={disabled}
              onClick={() => onChange('')}
            >
              Clear related task
            </button>
          )}
          <label htmlFor="task-search">Find a task</label>
          <input
            id="task-search"
            type="search"
            placeholder="Task ID, name or work area"
            value={search}
            disabled={disabled}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="task-picker-results" aria-label="Matching tasks">
            {matches.slice(0, 8).map((task) => (
              <button
                key={task.id}
                type="button"
                disabled={disabled}
                aria-pressed={value === task.id}
                aria-label={`Select ${task.externalId} · ${task.name}`}
                onClick={() => onChange(task.id)}
              >
                <strong>
                  {task.externalId} · {task.name}
                </strong>
                <span>{task.location}</span>
              </button>
            ))}
          </div>
          <p className="field-explanation" role="status">
            {!matches.length
              ? 'No tasks match your search. Try another name or leave the task blank.'
              : matches.length > 8
                ? `Showing 8 of ${matches.length} tasks. Type more to narrow the list.`
                : `${matches.length} matching tasks.`}
          </p>
        </>
      ) : (
        <p className="field-explanation">
          No tasks are available for your account yet. You can still describe the work and send your
          report.
        </p>
      )}
    </details>
  );
}
