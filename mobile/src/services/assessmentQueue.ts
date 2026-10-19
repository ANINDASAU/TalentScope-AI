import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Persistent offline queue for assessments created without connectivity.
 *
 * Stored as a single JSON array under QUEUE_KEY (same AsyncStorage architecture
 * as session.ts). Entries survive app restarts, navigation and network loss.
 * Only lightweight metadata + a local FILE REFERENCE are stored here — binary
 * video data must live on disk (expo-file-system), never inside this JSON.
 */

const QUEUE_KEY = 'talentscope.offline.assessments.v1';
/** Mirror of the last durable state; used to survive a crash mid-write. */
const QUEUE_BACKUP_KEY = 'talentscope.offline.assessments.v1.backup';

/** Mirrors backend Assessment.status enum conventions */
export type QueuedSyncStatus =
  | 'pending'
  | 'uploading'
  | 'processing'
  | 'completed'
  | 'failed';

/**
 * Why a synchronization attempt failed. Temporary categories are eligible for
 * automatic retry (with backoff); permanent ones require manual retry.
 *
 * Category contract (Phase 7):
 *  - network               temporary — connection unavailable / request failed
 *  - server_unavailable    temporary — 5xx that is not a data problem
 *  - upload_failed         temporary — generic upload error (incl. timeouts)
 *  - video_unavailable     permanent-ish — local recording missing/corrupted;
 *                          never auto-retries uselessly (retrying cannot
 *                          restore a deleted file); manual retry syncs
 *                          metadata-only
 *  - auth                  permanent — session expired; needs re-login
 *  - invalid_data          permanent — the payload is wrong (validation)
 *  - permanent             permanent — definitive backend rejection
 */
export type SyncErrorCategory =
  | 'network'
  | 'server_unavailable'
  | 'upload_failed'
  | 'video_unavailable'
  | 'auth'
  | 'invalid_data'
  | 'permanent';

export interface QueuedAssessment {
  /** Stable locally-generated identifier (survives restarts) */
  localId: string;
  /** Idempotency key preventing duplicate submissions of the same logical assessment */
  idempotencyKey: string;
  /** Server assessment id once synchronization has created the remote record */
  serverId: string | null;
  /** Owning athlete (User._id) */
  athleteId: string;
  sport: string;
  testType: string;
  category?: string;
  notes?: string;
  /** Local file-system URI reference — NEVER raw video bytes */
  localVideoUri: string | null;
  createdAt: string;
  updatedAt: string;
  syncStatus: QueuedSyncStatus;
  retryCount: number;
  lastSyncAttemptAt: string | null;
  /** User-friendly failure reason */
  error: string | null;
  /** Structured failure classification driving retry policy */
  errorCategory: SyncErrorCategory | null;
  /** Earliest time automatic retry may run (backoff) */
  nextAttemptAt: string | null;
}

export interface QueuedAssessmentInput {
  athleteId: string;
  sport: string;
  testType: string;
  category?: string;
  notes?: string;
  localVideoUri?: string | null;
  /**
   * Pass the same key when retrying creation of the SAME logical assessment
   * (e.g. after a timeout where the request may have reached the server).
   * Omit for genuinely new assessments.
   */
  idempotencyKey?: string;
}

export type QueuedAssessmentPatch = Partial<
  Omit<QueuedAssessment, 'localId' | 'idempotencyKey' | 'createdAt'>
>;

export const makeLocalId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;

/**
 * Crash-safe queue storage (Phase 9).
 *
 * AsyncStorage writes are not atomic: if the app is killed MID-WRITE the
 * primary key can hold truncated/unparseable JSON. Every write therefore
 * first mirrors the CURRENT durable state to a backup key, then writes the
 * new state to the primary. On read, a corrupt/missing primary is recovered
 * from the backup — queued assessments are never silently lost to a crash
 * that happened during a write. (The backup can lag one mutation behind;
 * losing the very last in-flight mutation is unavoidable without a
 * transactional store, and the sync engine's recovery handles the rest:
 * an entry that lost its final state patch is re-derived deterministically.)
 */
const readQueue = async (): Promise<QueuedAssessment[]> => {
  const parseList = (raw: string | null): QueuedAssessment[] | null => {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };

  try {
    const primary = parseList(await AsyncStorage.getItem(QUEUE_KEY));
    if (primary) return primary;

    // Primary corrupt or missing (crash mid-write / partial storage flush):
    // fall back to the backup mirror BEFORE giving up.
    const backup = parseList(await AsyncStorage.getItem(QUEUE_BACKUP_KEY));
    if (backup) {
      console.warn('[AssessmentQueue] primary storage unreadable — recovered from backup mirror');
      // self-heal the primary immediately
      try { await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(backup)); } catch {}
      return backup;
    }

    if ((await AsyncStorage.getItem(QUEUE_KEY)) !== null) {
      // primary existed but was corrupt AND backup was unusable: worst case.
      console.warn('[AssessmentQueue] queue storage unreadable (primary + backup) — starting empty');
    }
    return [];
  } catch (e) {
    console.warn('[AssessmentQueue] read failed:', e);
    return [];
  }
};

let traceId = Math.random().toString(36).slice(2, 6);
const writeQueue = async (queue: QueuedAssessment[]): Promise<void> => {
  if (__DEV__) {
    try { console.log('[QW/' + traceId + '] writing ' + queue.length + ' entries: ' + queue.map(q => q.syncStatus[0] + (q.serverId ? '+' : '-')).join(',')); } catch {}
  }
  // 1. mirror the CURRENT durable state before mutating the primary, so a
  //    crash mid-write leaves the backup holding the last good state.
  try {
    const prev = await AsyncStorage.getItem(QUEUE_KEY);
    if (prev) await AsyncStorage.setItem(QUEUE_BACKUP_KEY, prev);
  } catch {}
  // 2. write the new state
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
};

/**
 * Serializes queue mutations. AsyncStorage read-modify-write is not atomic:
 * overlapping mutations could otherwise lose entries (both read the old
 * array, one write overwrites the other's addition).
 */
let mutationChain: Promise<void> = Promise.resolve();

const withLock = async <T>(op: () => Promise<T>): Promise<T> => {
  const run = mutationChain.then(op);
  // Keep the chain alive even if op rejects; return op's result to caller.
  mutationChain = run.then(() => undefined, () => undefined);
  return run;
};

/**
 * Adds an assessment to the queue.
 * Throws when an entry with the same idempotencyKey already exists
 * (prevents duplicate submissions of the same logical assessment).
 */
export const addQueuedAssessment = async (
  input: QueuedAssessmentInput
): Promise<QueuedAssessment> => {
  if (!input?.athleteId) throw new Error('athleteId is required');
  if (!input.sport) throw new Error('sport is required');
  if (!input.testType) throw new Error('testType is required');

  return withLock(async () => {
    const queue = await readQueue();
    const idempotencyKey =
      input.idempotencyKey?.trim() ||
      `${input.athleteId}:${input.testType}:${Date.now()}`;

    if (queue.some(q => q.idempotencyKey === idempotencyKey)) {
      throw new Error(
        `Duplicate queued assessment (idempotencyKey=${idempotencyKey})`
      );
    }

    const now = new Date().toISOString();
    const entry: QueuedAssessment = {
      localId: makeLocalId(),
      idempotencyKey,
      serverId: null,
      athleteId: input.athleteId,
      sport: input.sport,
      testType: input.testType,
      category: input.category,
      notes: input.notes,
      localVideoUri: input.localVideoUri ?? null,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
      retryCount: 0,
      lastSyncAttemptAt: null,
      error: null,
      errorCategory: null,
      nextAttemptAt: null
    };

    await writeQueue([...queue, entry]);
    return entry;
  });
};

/** Returns all queued assessments, oldest first (FIFO synchronization order). */
export const getQueuedAssessments = async (): Promise<QueuedAssessment[]> => {
  const queue = await readQueue();
  return [...queue].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
};

export const getQueuedAssessmentById = async (
  localId: string
): Promise<QueuedAssessment | null> => {
  const queue = await readQueue();
  return queue.find(q => q.localId === localId) ?? null;
};

/**
 * Patch an entry (localId / idempotencyKey / createdAt are immutable).
 * updatedAt is refreshed automatically.
 */
export const updateQueuedAssessment = async (
  localId: string,
  patch: QueuedAssessmentPatch
): Promise<QueuedAssessment | null> => {
  return withLock(async () => {
    const queue = await readQueue();
    const idx = queue.findIndex(q => q.localId === localId);
    if (idx === -1) return null;

    const safePatch: QueuedAssessmentPatch = { ...patch };
    delete (safePatch as any).localId;
    delete (safePatch as any).idempotencyKey;
    delete (safePatch as any).createdAt;

    const updated: QueuedAssessment = {
      ...queue[idx],
      ...safePatch,
      updatedAt: new Date().toISOString()
    };
    queue[idx] = updated;
    await writeQueue(queue);
    return updated;
  });
};

/** Removes an entry. Returns true when something was removed. */
export const removeQueuedAssessment = async (localId: string): Promise<boolean> => {
  return withLock(async () => {
    const queue = await readQueue();
    const next = queue.filter(q => q.localId !== localId);
    if (next.length === queue.length) return false;
    await writeQueue(next);
    return true;
  });
};

/** Drops all entries whose sync completed. Returns how many were removed. */
export const clearCompletedFromQueue = async (): Promise<number> => {
  return withLock(async () => {
    const queue = await readQueue();
    const kept = queue.filter(q => q.syncStatus !== 'completed');
    const removed = queue.length - kept.length;
    if (removed > 0) await writeQueue(kept);
    return removed;
  });
};

/** Convenience: number of entries still awaiting synchronization. */
export const countPendingQueued = async (): Promise<number> => {
  const queue = await readQueue();
  return queue.filter(q => q.syncStatus !== 'completed').length;
};
