/**
 * STEP 7 — selected-assessment view state.
 *
 * Single rulebook for "which assessment's risk visualization is on screen":
 * every screen derives its branches from `resolveAssessmentView`, so a
 * newly selected assessment ALWAYS clears the previous document first
 * (loading/error outputs carry `assessment: null` — stale data can never
 * leak across IDs), and every backend edge maps to an explicit state.
 *
 * No caching lives here: callers fetch per selected ID and hold no memo.
 */

export const PROCESSING_STATUSES = ['created', 'pending', 'uploading', 'processing'];

export type AssessmentViewStatus =
  | 'loading'
  | 'ready'
  | 'processing'
  | 'failed'
  | 'empty'
  | 'error';

export interface AssessmentSelectionInput {
  assessment: any | null;
  loading: boolean;
  error: any | null;
}

export interface AssessmentView {
  status: AssessmentViewStatus;
  /** The document to visualize — ALWAYS null unless status is actionable. */
  assessment: any | null;
  /** User-facing message for the error state (null otherwise). */
  errorMessage: string | null;
  /** HTTP status when the error came from the API (null otherwise). */
  errorStatus: number | null;
}

/** Map a fetch failure to an honest, status-aware message. */
export const errorMessageFor = (err: any): { message: string; status: number | null } => {
  const status =
    typeof err?.status === 'number'
      ? err.status
      : typeof err?.response?.status === 'number'
        ? err.response.status
        : null;
  const raw = typeof err?.message === 'string' ? err.message : '';
  if (status === 404) return { message: 'Assessment not found. It may have been removed.', status };
  if (status === 403) {
    return {
      message: raw || "You don't have access to this assessment.",
      status
    };
  }
  if (status === 401) return { message: 'Session expired — please log in again.', status };
  if (/network|timed out|failed to fetch|load failed|network request failed/i.test(raw)) {
    return { message: 'No connection. Check your network and retry.', status };
  }
  return { message: raw || 'Failed to load assessment.', status };
};

export const resolveAssessmentView = (input: AssessmentSelectionInput): AssessmentView => {
  const { assessment, loading, error } = input;
  if (loading) return { status: 'loading', assessment: null, errorMessage: null, errorStatus: null };
  if (error) {
    const mapped = errorMessageFor(error);
    return { status: 'error', assessment: null, errorMessage: mapped.message, errorStatus: mapped.status };
  }
  if (!assessment) return { status: 'empty', assessment: null, errorMessage: null, errorStatus: null };
  const st = assessment?.status;
  if (PROCESSING_STATUSES.includes(st)) return { status: 'processing', assessment, errorMessage: null, errorStatus: null };
  if (st === 'failed') return { status: 'failed', assessment, errorMessage: null, errorStatus: null };
  return { status: 'ready', assessment, errorMessage: null, errorStatus: null };
};

/**
 * Heatmap diagram state for a resolved view. Non-ready views never show
 * markers: processing/error get their overlays, everything else renders
 * the (possibly empty) diagram honestly.
 */
export const heatmapStateForView = (
  viewStatus: AssessmentViewStatus
): 'ready' | 'loading' | 'processing' | 'error' => {
  switch (viewStatus) {
    case 'loading':
      return 'loading';
    case 'processing':
      return 'processing';
    case 'error':
    case 'failed':
      return 'error';
    default:
      return 'ready';
  }
};
