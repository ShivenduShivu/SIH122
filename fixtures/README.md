# Development fixtures

`development.ts` defines synthetic data authored for this project, not copied from Oil India records. Dates are illustrative September 2026 dates and do not advance with the clock.

- 12 planned main-project activities: four each in Civil, Piping and Electrical.
- A separate project and activity for scope-isolation checks.
- Two contractor identifiers and seven sample members (three main-project reporters, a supervisor, planner, manager and isolated-project reporter).
- Missing-room, reassignment and partial-scope language cases. These are separate acceptance examples, not extra main-project activities.
- No actual progress, accepted event, real contact details or authentic credentials are seeded in Phase 1.

The fixture relationship validator checks internal IDs, active revision relationships and same-project reporter assignments. It does **not** test database authorization: real RLS, private Storage and session checks are Phase 2 work. Fixture IDs are stable so tests can refer to the same records.

This data is available to developers and the public synthetic preview. It must never be scored as an unseen evaluation set; the frozen benchmark is created separately in Phase 7. Technical completion policies still need explicit domain validation before a real pilot.
