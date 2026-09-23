'use client';
import { useState } from 'react';
import type { PlannedActivity } from '@nirmaan/contracts';
import { formatDateOnly } from '@nirmaan/domain';

export function ScheduleRegister({
  activities,
  initialDiscipline,
}: {
  activities: PlannedActivity[];
  initialDiscipline: string;
}) {
  const [discipline, setDiscipline] = useState(initialDiscipline);
  const [query, setQuery] = useState('');
  const rows = activities.filter(
    (a) =>
      (discipline === 'All' || a.discipline === discipline) &&
      `${a.externalId} ${a.name} ${a.location}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <section className="panel register" aria-label="Planned schedule register">
      <div className="register-tools">
        <div className="filter-field">
          <label htmlFor="discipline-filter">Discipline</label>
          <select
            id="discipline-filter"
            value={discipline}
            onChange={(e) => setDiscipline(e.target.value)}
          >
            <option>All</option>
            {[...new Set(activities.map((a) => a.discipline))].map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </div>
        <div className="filter-field search-label">
          <label htmlFor="activity-search">Find activity</label>
          <input
            id="activity-search"
            type="search"
            placeholder="Activity ID, description or location"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <span className="record-count" aria-live="polite">
          {rows.length} activities
        </span>
      </div>
      <div
        className="table-scroll"
        role="region"
        aria-label="Schedule table, scroll horizontally on small screens"
        tabIndex={0}
      >
        <table>
          <caption className="sr-only">
            Synthetic planned dates. Actual progress is not connected.
          </caption>
          <thead>
            <tr>
              <th scope="col">Activity / work location</th>
              <th scope="col">Discipline</th>
              <th scope="col">Planned start</th>
              <th scope="col">Planned finish</th>
              <th scope="col">Scope</th>
              <th scope="col">Actual progress</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td>
                  <span className="activity-id">{a.externalId}</span>
                  <strong>{a.name}</strong>
                  <small>{a.location}</small>
                </td>
                <td>
                  <span className={`discipline-tag ${a.discipline.toLowerCase()}`}>
                    {a.discipline}
                  </span>
                </td>
                <td>{formatDateOnly(a.plannedStart)}</td>
                <td>{formatDateOnly(a.plannedFinish)}</td>
                <td>
                  {a.targetQuantity === null ? 'Not specified' : `${a.targetQuantity} ${a.unit}`}
                </td>
                <td>
                  <span className="muted">Not connected</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && (
        <div className="empty-state">
          <h2>No matching activities</h2>
          <p>Try another location, activity ID or discipline.</p>
          <button
            className="button"
            onClick={() => {
              setQuery('');
              setDiscipline('All');
            }}
          >
            Clear filters
          </button>
        </div>
      )}
      <div className="panel-note">
        {rows.length} of {activities.length} activities · September 2026 · Site timezone:
        Asia/Kolkata
      </div>
    </section>
  );
}
