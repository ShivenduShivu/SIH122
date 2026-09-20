# Nirmaan — proposed interface direction

Prepared for the BITS Pilani team working on SIH problem statement 26122.

## Design choice

Use the friend’s PDF’s Department Register direction as the visual starting point: a formal masthead, horizontal navigation, subdued navy, thin rules, and legible records. Combine this with the original desktop references’ activity hierarchy, Gantt schedule and detail drawer. The mobile interface retains the original references’ large reporting controls, task cards and bottom navigation.

This is an independent student prototype. Use the product identity and a clearly marked fictional project; do not present it as an official Oil India service or use government insignia to imply endorsement.

## Desktop screens

- **Overview:** outstanding reviews, completed activities and recent accepted records. Do not invent an overall progress percentage without defined weighting.
- **Schedule:** discipline groups, timeline/table switch, baseline visibility, activity selection and filters. The timeline uses a September 2026 demonstration schedule. It does not calculate dependencies or forecasts.
- **Activity record:** dates, quantities, source evidence and audit history in a right-hand drawer. On narrow screens the drawer moves below the main content.
- **Field reports:** register of original voice, text and DPR reports with independent review status.
- **Review queue:** original wording, extracted meaning, unresolved details, candidate activities and the planner’s decision. Demonstrate an ambiguous line tag, a missing work date and unplanned work.
- **Execution history:** accepted completion records and discipline vocabulary. Date spans are explicitly distinguished from working durations.

## Field PWA screens

- **Home:** current assignment, accepted quantity, voice/text/photo entry points and the last accepted report.
- **My work:** today’s activity, next assignment and work-package context.
- **Report:** voice interaction demonstration, editable text and local photo selection. English/Hindi labels are available.
- **Check:** original wording, work date, suggested activity and any unfinished work.
- **Sent / saved:** distinguish delivery to the planner from saving on a disconnected device.
- **My reports:** distinguish saved, sent for review and accepted reports. Demonstrate reconnection and a user-triggered sync.

## Interaction and visual rules

1. Keep desktop application navigation at the top. Use the side column only inside review workflows.
2. Use navy for primary actions, amber for unresolved work and green for accepted records. Pair colour with text.
3. Give field reporting one clear primary action per step. Keep technical matching scores away from workers.
4. Keep original evidence visible during review. Missing work dates remain unknown until confirmed; upload dates do not fill them.
5. Reporting a spool or pending NDT must not automatically complete an entire line.
6. Retain separate reported, accepted and externally synchronized states.
7. Use serif headings for institutional character and a sans-serif face for forms and dense records.

## Preview boundaries

The two interactive previews are design artifacts, not production software. They use fictional data and local interaction state. They are not linked to one another, a live schedule, Oil India systems or a database.

Voice transcription is a sample sequence, not actual recording or ASR. Photo selection does not upload a file. Offline saving, reconnection and synchronization demonstrate the intended interface; they are not a production persistence or background-sync implementation. The sample import/export dialogs demonstrate review requirements rather than processing real Primavera files.

The PDF’s references to particular repositories, team names or existing backend capabilities were treated as reference-document claims, not instructions or verified project facts.

## Build priorities after design review

1. Implement the shared masthead, navigation, record layouts and mobile reporting controls.
2. Connect the report → review → accepted event workflow end to end.
3. Implement reliable offline submission state, retry handling and evidence storage.
4. Add schedule import, stable activity identifiers and real evidence/audit views.
5. Refine Gantt behaviour after table-based schedule correctness is established.

The interactive previews remain separate from the application implementation and do not decide the production technology stack.
