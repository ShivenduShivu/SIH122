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
