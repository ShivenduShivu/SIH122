import { database, sameOrigin } from './supabase';
export async function apiSession(request?: Request) {
  if (request && !sameOrigin(request))
    return { response: apiJson({ error: 'Origin rejected' }, { status: 403 }) } as const;
  const db = await database();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user)
    return { response: apiJson({ error: 'Sign in required' }, { status: 401 }) } as const;
  return { db, user: data.user } as const;
}
const messages: Record<string, string> = {
  CHANGE_PREVIEW_REQUIRED: 'Preview the proposed change before accepting it.',
  STALE_CHANGE_PREVIEW: 'The proposed change is no longer current. Preview it again.',
  SOURCE_CONTRACTOR_MISMATCH:
    'This activity belongs to a different contractor. Check the source workbook allocation.',
  INVALID_PROGRESS_PERCENT:
    'Confirm that this is activity progress, not a test result, and give its basis.',
  PROGRESS_BASIS_CONFLICT:
    'This percentage uses a different basis from the accepted reading. Ask the reporter to clarify.',
  SAME_DAY_PROGRESS_CONFLICT:
    'Different readings already exist for this date. Correct the earlier reading or record this as an observation.',
  OVERLAPPING_ITEMS: 'Some of these items were already counted. Confirm which items are new.',
  ITEM_COVERAGE_CONFLICT:
    'These quantities name different items. Check the covered items before treating the reports as equivalent.',
  DAILY_ALREADY_COVERED:
    'An accepted cumulative total already covers this day. Record it as supporting evidence or review a correction.',
  COVERAGE_REQUIRED: 'Confirm which day this additional quantity covers.',
  NO_EQUIVALENT_READING:
    'No equivalent accepted reading was found. Check the date, quantity and basis.',
  INITIAL_IMPORT_ONLY:
    'This project already has a schedule. Replacing a used revision is not enabled; use a new project for an initial import.',
  STALE_IMPORT_PREVIEW:
    'This preview or project revision changed. Reload the import before activating.',
  UPLOAD_INCOMPLETE:
    'One or more source files are missing or incomplete. Retry the upload before processing.',
  IMPORT_NOT_READY: 'Fix the listed import errors and upload a corrected file before activation.',
  MIXED_LOCATION_REPLY:
    'Choose listed work areas or type another location. Please use one method so the answer is clear.',
  SCOPE_REPLY_NEEDS_REVIEW:
    'If work remains or needs checking, choose No and describe it. For Yes, leave the details box empty.',
  STALE_QUESTION:
    'This question changed or was already answered. Review the current question before replying.',
  STALE_VERIFICATION:
    'The work, assignment or authority changed. A planner must request a fresh check.',
  VERIFICATION_REQUIRED_OR_STALE:
    'An independent supervisor must confirm this exact work before acceptance.',
  REPORTER_CONFIRMATION_REQUIRED:
    'Ask the reporter to confirm the changed assignment before requesting a supervisor check.',
  VERIFICATION_ALREADY_OPEN: 'A supervisor check already exists for this claim.',
  NO_AUTHORIZED_VERIFIER:
    'No independent supervisor currently has the required work-area authority. Ask the project manager to check routing.',
  OPEN_QUESTION: 'The reporter must answer the open question before this claim can be accepted.',
  REPORT_HAS_ACCEPTED_EVENTS:
    'This report has accepted work and cannot be withdrawn. Request a scoped correction instead.',
  STALE_CORRECTION:
    'This accepted event already has a newer correction. Review the current record.',
  CORRECTION_DATE_CONFLICT:
    'That date conflicts with accepted work on this activity. Review the other dates first.',
  AMENDMENT_PROCESSING: 'A correction for this claim is already processing.',

  STALE_REVIEW: 'This report or its review policy changed. Refresh and check it again.',
  STALE_ACTUALS: 'Another update changed this activity. Refresh before deciding.',
  COMMAND_ID_REUSED: 'This retry contains different details. Refresh and submit a new decision.',
  CAPTURE_ID_REUSED: 'This retry contains different report text. Start a new submission.',
  MATCH_REQUIRES_CLARIFICATION:
    'The reported location, asset or stage conflicts with this activity. Verify the details first.',
  MISSING_OR_UNRESOLVED_FACTS:
    'Some required details are missing or unclear. Resolve them before accepting.',
  ASSIGNMENT_REQUIRES_VERIFICATION:
    'This work is outside the reporter’s current assignment. Supervisor verification is required.',
  NON_EXECUTION_CLAIM:
    'This report does not confirm actual work that started, progressed or finished.',
  MISSING_EVENT_DATE: 'Confirm when the work happened before accepting it.',
  PARTIAL_SCOPE: 'Confirm which activity started.',
  PARTIAL_SCOPE_CANNOT_FINISH: 'Partial work cannot mark the whole activity complete.',
  EXISTING_START_REQUIRES_RECONCILIATION:
    'A start is already recorded. Check the existing record before changing it.',
  EXISTING_FINISH_REQUIRES_RECONCILIATION:
    'A finish is already recorded. Check the existing record before changing it.',
  MISSING_ACTUAL_START: 'Approve the actual start before approving the finish.',
  FINISH_BEFORE_START: 'The finish cannot be earlier than the recorded start.',
  FINISH_BEFORE_PROGRESS:
    'Work was recorded after this proposed finish. Check the finish date or correct the later reading.',
  COMPOUND_SCOPE_INCOMPLETE:
    'This planned activity includes several stages. Confirm all of them before marking it complete.',
  INCOMPLETE_QUANTITY: 'The quantity or unit does not support completion of the whole activity.',
  QUANTITY_SCOPE_REQUIRES_REVIEW:
    'Confirm the quantity, unit and whether it is a total or an addition.',
  QUANTITY_DATE_OR_STATE_CONFLICT:
    'This quantity conflicts with the activity’s dates or current state.',
  POSSIBLE_DUPLICATE_QUANTITY:
    'The same quantity and date were already accepted. Check for a duplicate.',
  QUANTITY_REQUIRES_CORRECTION:
    'The quantity decreases recorded progress or exceeds the planned amount. Review it first.',
};
export function rpcResponse(result: {
  data: unknown;
  error: { code?: string; message: string } | null;
}) {
  if (result.error) {
    const code = result.error.code;
    return apiJson(
      {
        error:
          code === '42501'
            ? 'Access denied'
            : code === '40001'
              ? (messages[result.error.message] ??
                'The record changed. Refresh and check it again.')
              : code?.startsWith('22')
                ? (messages[result.error.message] ?? 'Check the report details before submitting.')
                : 'Could not save this change. Retry after refreshing.',
      },
      {
        status:
          code === '42501' ? 403 : code === '40001' ? 409 : code?.startsWith('22') ? 422 : 503,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
  return apiJson(result.data, { headers: { 'Cache-Control': 'no-store' } });
}

export function apiJson(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Request-Id', crypto.randomUUID());
  return Response.json(data, { ...init, headers });
}
