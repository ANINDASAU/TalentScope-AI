import {
  getQueuedAssessments,
  updateQueuedAssessment,
  QueuedAssessment
} from './assessmentQueue';
import { createAssessment, updateAssessmentStatus, getAssessmentHistory, getAssessmentById } from './api';
import { getNetworkStatus, subscribeToNetwork, refreshNetworkState } from './network';
import { SyncErrorCategory } from './assessmentQueue';
import { AppState } from 'react-native';
import { cleanupOrphanedVideos, verifyQueueIntegrity, probeVideoReference, deleteVideoForServerId, cleanupCompletedEntries } from './storageManager';

/**
 * Offline assessment synchronization engine.
 *
 * Triggered automatically on offline -> online transitions, once after boot,
 * and by a 60s sweep. Processes the persistent queue strictly one-at-a-time
 * using ONLY the existing assessment lifecycle APIs (createAssessment /
 * updateAssessmentStatus / getAssessmentById — no new backend endpoints).
 *
 * Per-entry flow:
 *   pending -> validate local data + local video reference
 *           -> uploading
 *           -> createAssessment (or ADOPT an ambiguous existing record when the
 *              create's outcome is unknown — timeout / malformed response)
 *           -> serverId persisted locally (before anything else happens)
 *           -> updateAssessmentStatus('processing')
 *           -> local 'processing'   (upload success is NOT analysis completion)
 *           -> reconciliation (each sweep): poll the server record
 *                server 'completed' -> local cleanup: video file + queue entry
 *                                      removed ONLY after server confirmation
 *                server 'failed'    -> local 'failed' with the server's reason
 *                server record gone -> forget serverId, re-create next attempt
 *
 * Failure handling (bounded, never unlimited):
 *   - temporary errors (network / server_unavailable / upload_failed) retry
 *     automatically with exponential backoff 30s -> 60s -> 2m -> 5m, capped at
 *     MAX_AUTO_RETRIES total attempts; afterwards the entry is terminal
 *     'failed' until the user retries manually (manual retry resets the budget).
 *   - auth expiration (401/403) stops the whole run and requires re-login.
 *   - invalid/permanent errors never auto-retry.
 *
 * Interrupted-run safety (idempotent, safe to run repeatedly):
 *   - single-flight lock prevents concurrent runs
 *   - 'uploading' without serverId -> back to 'pending' on boot (never confirmed)
 *   - 'uploading' with serverId    -> 'processing' on boot (server has it)
 *   - serverId short-circuit: an entry that already has one never re-creates
 *   - network disappearing mid-run stops before the next entry; remaining
 *     entries are untouched and resume when connectivity returns
 */

const MAX_AUTO_RETRIES = 5;

export type SyncEventType =
  | 'sync-start'
  | 'sync-end'
  | 'entry-synced'
  | 'entry-failed'
  | 'auth-expired';

export interface SyncEvent {
  type: SyncEventType;
  localId?: string;
  detail?: string;
}

let running = false;
let initialized = false;
const listeners = new Set<(e: SyncEvent) => void>();

const emit = (e: SyncEvent) => {
  listeners.forEach(l => {
    try { l(e); } catch {}
  });
};

export const subscribeSyncEvents = (cb: (e: SyncEvent) => void): (() => void) => {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
};

const isAuthError = (e: any): boolean => e?.status === 401 || e?.status === 403;

/** Categories eligible for automatic retry (with increasing backoff) */
const TEMPORARY_CATEGORIES: SyncErrorCategory[] = ['network', 'server_unavailable', 'upload_failed'];

/** Exponential backoff schedule for temporary failures: 30s -> 60s -> 2m -> 5m -> 10m */
const retryDelayMs = (attempt: number): number => {
  const delays = [30000, 60000, 120000, 300000, 600000];
  return delays[Math.min(Math.max(attempt - 1, 0), delays.length - 1)];
};

/**
 * Maps any synchronization error to a stable category + a user-friendly message.
 * Temporary categories auto-retry (bounded); auth/invalid_data/permanent/
 * video_unavailable never auto-retry.
 *
 * Category map (Phase 7):
 *   401/403                                  -> auth          (session expired)
 *   400/404/422 + validation-shaped 5xx      -> invalid_data  (bad payload)
 *   other 5xx                                -> server_unavailable
 *   2xx-with-no-id / unknown statuses        -> upload_failed (incl. timeout)
 *   timeout / fetch failure                  -> network
 */
const classifyError = (e: any): { category: SyncErrorCategory; userMessage: string } => {
  const status: number | undefined = e?.status;
  const raw = String(e?.message || '');

  if (isAuthError(e)) {
    return { category: 'auth', userMessage: 'Session expired — log in again to sync' };
  }
  if (status === 400 || status === 404 || status === 422) {
    return { category: 'invalid_data', userMessage: 'Assessment data is invalid — fix or delete this entry' };
  }
  if (status && status >= 500) {
    if (/validation failed|is not a valid enum value|Cast to .* failed|is required/i.test(raw)) {
      return { category: 'invalid_data', userMessage: 'Assessment data is invalid — fix or delete this entry' };
    }
    return { category: 'server_unavailable', userMessage: 'Server unavailable — will retry automatically' };
  }
  if (status) {
    return { category: 'permanent', userMessage: 'Rejected by server' };
  }
  if (/timed out|Failed to fetch|Network request/i.test(raw)) {
    return { category: 'network', userMessage: 'No connection — will retry automatically' };
  }
  return { category: 'upload_failed', userMessage: 'Upload failed — will retry automatically' };
};

const isNetworkError = (e: any): boolean => {
  const msg = String(e?.message || '');
  return (
    e?.name === 'AbortError' ||
    msg.includes('Failed to fetch') ||
    msg.includes('Network request') ||
    msg.includes('timed out')
  );
};

/**
 * Errors where the create request's outcome is UNKNOWN: the request may have
 * reached the server and created the record even though we saw an error
 * (timeout / dropped connection) or a response we could not read (malformed
 * body, missing id). These MUST go through orphan adoption, never a blind retry.
 */
const isUnknownOutcomeError = (e: any): boolean =>
  isNetworkError(e) || /missing assessment id|Malformed response/i.test(String(e?.message || ''));

/**
 * Pre-upload validation of the local video reference via the storage manager
 * (existence + integrity). Returns a recoverable-failure message when the
 * recording is unusable, or null when synchronization may proceed.
 * 'ok' (exists AND parses) and unverifiable platforms pass.
 */
const describeVideoProblem = async (uri: string | null): Promise<string | null> => {
  if (!uri) return null;
  const probe = await probeVideoReference(uri);
  if (probe.status === 'ok') return null;
  if (probe.status === 'missing') {
    return 'Saved recording file is no longer available. Retry will sync this assessment without the video.';
  }
  if (probe.status === 'corrupt') {
    return 'Saved recording file is damaged. Retry will sync this assessment without the video.';
  }
  return 'Recording file reference is invalid. Retry will sync this assessment without the video.';
};

/**
 * If a create request had an UNKNOWN outcome (timeout / dropped connection /
 * unreadable response), the assessment may already exist server-side. Adopt it
 * from history instead of creating a duplicate: match sport + testType created
 * within ±3 minutes of our attempt, excluding assessments already claimed by
 * other queue entries.
 */
const adoptOrphanServerRecord = async (
  entry: QueuedAssessment,
  claimedServerIds: Set<string>
): Promise<string | null> => {
  try {
    const res: any = await getAssessmentHistory();
    const list: any[] = res?.data ?? res ?? [];
    const attemptAt = entry.lastSyncAttemptAt ? new Date(entry.lastSyncAttemptAt).getTime() : Date.now();
    const candidate = list.find(a => {
      if (!a?._id || claimedServerIds.has(a._id)) return false;
      if (String(a.testType || '') !== String(entry.testType)) return false;
      if (String(a.sport || '') !== String(entry.sport)) return false;
      const created = new Date(a.createdAt).getTime();
      return Math.abs(created - attemptAt) < 180000;
    });
    return candidate?._id ?? null;
  } catch {
    return null;
  }
};

/** Synchronizes ONE queue entry through the existing assessment lifecycle. */
const syncEntry = async (entry: QueuedAssessment): Promise<void> => {
  // 0. Validate the local recording: a vanished/damaged file fails gracefully
  //    (video_unavailable — never auto-retried uselessly; manual retry syncs
  //    the assessment metadata without the video).
  const videoProblem = await describeVideoProblem(entry.localVideoUri);
  if (videoProblem) {
    await updateQueuedAssessment(entry.localId, {
      syncStatus: 'failed',
      errorCategory: 'video_unavailable',
      error: videoProblem,
      nextAttemptAt: null
    });
    emit({ type: 'entry-failed', localId: entry.localId, detail: 'local video unusable' });
    throw Object.assign(new Error('Local video reference unusable'), { permanentSkip: true });
  }

  await updateQueuedAssessment(entry.localId, {
    syncStatus: 'uploading',
    lastSyncAttemptAt: new Date().toISOString()
  });

  let serverId = entry.serverId;
  const hadServerId = Boolean(serverId);

  // 1. Ensure the assessment exists on the server
  if (!serverId) {
    try {
      const created: any = await createAssessment({
        sport: entry.sport,
        testType: entry.testType,
        category: entry.category || entry.sport,
        notes: entry.notes,
        videoUrl: null,
        // Stable client-generated identifier: the backend returns the EXISTING
        // record when a retry replays the same key (response lost, restart,
        // manual retry, flapping connectivity) — duplicates are impossible.
        idempotencyKey: entry.idempotencyKey
      });
      serverId = created?.data?._id ?? null;
      if (!serverId) throw new Error('Malformed response: missing assessment id');
      // Persist the server id IMMEDIATELY — everything after this must be
      // re-entry-safe because the local record now points at a real one.
      await updateQueuedAssessment(entry.localId, { serverId });
    } catch (e: any) {
      if (isAuthError(e)) throw e;
      // UNKNOWN outcome (timeout / dropped connection / malformed response):
      // the record may exist server-side — adopt instead of duplicating.
      if (isUnknownOutcomeError(e) && !serverId) {
        const all = await getQueuedAssessments();
        const claimed = new Set(all.map(q => q.serverId).filter(Boolean) as string[]);
        const adopted = await adoptOrphanServerRecord(
          { ...entry, lastSyncAttemptAt: new Date().toISOString() },
          claimed
        );
        if (adopted) {
          serverId = adopted;
          await updateQueuedAssessment(entry.localId, { serverId });
        }
      }
      if (!serverId) throw e;
    }
  }

  // 2. Push into processing (tolerate re-entry: transition may already be applied)
  try {
    await updateAssessmentStatus(serverId as string, 'processing');
  } catch (e: any) {
    if (isAuthError(e)) throw e;
    if (!hadServerId) throw e;
    // Prior run may have already set processing — verify it still exists & is ours
    const hist: any = await getAssessmentHistory();
    const list: any[] = hist?.data ?? hist ?? [];
    const mine = list.find(a => a._id === serverId);
    if (!mine) {
      // Server record vanished (e.g. DB reset): forget the id so the next
      // attempt re-creates the assessment instead of retrying a ghost.
      await updateQueuedAssessment(entry.localId, { serverId: null });
      throw new Error('Server record no longer exists — will re-create it');
    }
  }

  // 3. Server has it and is processing — upload success is NOT completion;
  //    the record stays local until the analysis outcome is reconciled.
  await updateQueuedAssessment(entry.localId, {
    syncStatus: 'processing',
    error: null,
    errorCategory: null,
    nextAttemptAt: null
  });
  console.log('[SYNC] entry done ' + entry.localId + ' -> ' + serverId);
  emit({ type: 'entry-synced', localId: entry.localId, detail: serverId ?? undefined });
};

/**
 * Reconciliation pass for entries in 'processing': polls the server record
 * (the "wait for backend analysis" step) and mirrors the outcome locally.
 *   server 'completed'  -> local cleanup per storage policy: video file and
 *                          queue entry removed ONLY after server confirmation
 *   server 'failed'     -> local 'failed' with the server's reason (manual retry)
 *   server record gone  -> forget serverId, re-queue for re-creation
 * Idempotent: safe to run every sweep.
 */
const reconcileProcessingEntries = async (): Promise<{ completed: number; failed: number }> => {
  let completed = 0;
  let failed = 0;
  const queue = await getQueuedAssessments();
  const processing = queue.filter(q => q.syncStatus === 'processing' && q.serverId);

  for (const entry of processing) {
    if (getNetworkStatus() !== 'online') break;
    try {
      const res: any = await getAssessmentById(entry.serverId as string);
      const a = res?.data;
      if (!a) continue;

      if (a.status === 'completed') {
        // Server-confirmed completion: cleanup video + entry (storage policy
        // deletes only after confirmation — guard enforced inside).
        await deleteVideoForServerId(entry.serverId as string, { confirmCompleted: true });
        completed++;
        emit({ type: 'entry-synced', localId: entry.localId, detail: entry.serverId ?? undefined });
      } else if (a.status === 'failed') {
        const reason = a.errorDetails?.message || 'Analysis failed on the server';
        await updateQueuedAssessment(entry.localId, {
          syncStatus: 'failed',
          errorCategory: 'permanent',
          error: `Analysis failed on server: ${reason}`,
          nextAttemptAt: null
        });
        failed++;
        emit({ type: 'entry-failed', localId: entry.localId, detail: reason });
      }
      // still 'created'/'pending'/'uploading'/'processing' server-side: keep waiting
    } catch (e: any) {
      if (e?.status === 404) {
        // Server record vanished: forget the id so the next run re-creates it
        await updateQueuedAssessment(entry.localId, { serverId: null, syncStatus: 'pending' });
        continue;
      }
      // Network/auth problems during reconciliation are non-fatal; the next
      // sweep retries. (Auth also blocks the main loop right after.)
      if (isAuthError(e)) emit({ type: 'auth-expired', detail: 'Session expired — log in again to sync' });
      continue;
    }
  }
  return { completed, failed };
};

/**
 * Processes all pending entries FIFO, one at a time. Safe to call repeatedly:
 * single-flight lock + per-entry state prevents duplicates and re-work.
 */
export const syncPendingAssessments = async (): Promise<{
  processed: number;
  synced: number;
  failed: number;
}> => {
  if (running) return { processed: 0, synced: 0, failed: 0 };
  if (getNetworkStatus() !== 'online') return { processed: 0, synced: 0, failed: 0 };

  running = true;
  console.log('[SYNC] started, online=' + getNetworkStatus());
  emit({ type: 'sync-start' });
  let synced = 0;
  let failed = 0;
  let processed = 0;

  try {
    // 0. Mirror any completed/failed analyses waiting on the server
    const rec = await reconcileProcessingEntries();
    synced += rec.completed;
    failed += rec.failed;

    const now = Date.now();
    const queue = await getQueuedAssessments();
    const candidates = queue.filter(q => {
      if (q.syncStatus !== 'pending' && q.syncStatus !== 'uploading' && q.syncStatus !== 'failed') {
        return false;
      }
      // Permanent failures never auto-retry; temporary ones stop after the cap
      if (q.syncStatus === 'failed') {
        const temporary =
          q.errorCategory && TEMPORARY_CATEGORIES.includes(q.errorCategory);
        if (!temporary || (q.retryCount || 0) >= MAX_AUTO_RETRIES) return false;
      }
      // Respect exponential backoff window
      if (q.nextAttemptAt && now < new Date(q.nextAttemptAt).getTime()) return false;
      return true;
    });

    for (const entry of candidates) {
      // Network disappeared mid-run — stop; remaining entries stay untouched
      if (getNetworkStatus() !== 'online') break;

      processed++;
      console.log('[SYNC] attempting entry ' + entry.localId);
      const attempt = (entry.retryCount || 0) + 1;
      await updateQueuedAssessment(entry.localId, {
        retryCount: attempt,
        lastSyncAttemptAt: new Date().toISOString()
      });

      try {
        await syncEntry({ ...entry, retryCount: attempt });
        synced++;
      } catch (e: any) {
        if (e?.permanentSkip) {
          // Already marked failed inside syncEntry — counted, no further changes
          failed++;
          continue;
        }
        failed++;
        const { category, userMessage } = classifyError(e);

        if (category === 'auth') {
          // Session expired: keep data, require manual re-login; stop the whole run
          await updateQueuedAssessment(entry.localId, {
            syncStatus: 'failed',
            errorCategory: category,
            error: userMessage,
            nextAttemptAt: null
          });
          emit({ type: 'auth-expired', localId: entry.localId, detail: userMessage });
          break;
        }

        if (TEMPORARY_CATEGORIES.includes(category)) {
          if (attempt >= MAX_AUTO_RETRIES) {
            // Bounded retries: automatic retry budget exhausted — terminal
            // 'failed' until the user explicitly retries (which resets it).
            await updateQueuedAssessment(entry.localId, {
              syncStatus: 'failed',
              errorCategory: category,
              error: `${userMessage} (stopped after ${attempt} attempts)`,
              nextAttemptAt: null
            });
          } else {
            // Temporary: schedule automatic retry with increasing backoff
            const nextAt = new Date(Date.now() + retryDelayMs(attempt)).toISOString();
            await updateQueuedAssessment(entry.localId, {
              syncStatus: 'pending',
              errorCategory: category,
              error: userMessage,
              nextAttemptAt: nextAt
            });
          }
        } else {
          // Permanent / invalid: never auto-retry — manual retry only
          await updateQueuedAssessment(entry.localId, {
            syncStatus: 'failed',
            errorCategory: category,
            error: userMessage,
            nextAttemptAt: null
          });
        }
        emit({ type: 'entry-failed', localId: entry.localId, detail: `${category}: ${userMessage}` });
      }
    }

    // Post-sync storage cleanup (Phase 11): reclaim files of COMPLETED
    // entries whose video could not be removed earlier (failed cleanup at
    // completion time, or entries completed through a non-owning path), then
    // sweep orphans. Conservative: touches only 'completed' entries and
    // unreferenced files; any failure leaves assessments valid + synchronized
    // and retries next sweep — prevents local storage growing indefinitely.
    if (synced > 0) {
      await cleanupCompletedEntries();
      await cleanupOrphanedVideos();
    }
  } finally {
    running = false;
    emit({ type: 'sync-end', detail: `${synced} synced, ${failed} failed` });
  }

  return { processed, synced, failed };
};

/**
 * Wire automatic synchronization triggers.
 *
 * Trigger contract (Phase 10) — PRIMARY: OFFLINE -> ONLINE transition.
 *   1. Connectivity:    subscribeToNetwork — the moment connectivity returns,
 *                       pending assessments sync (primary trigger).
 *   2. App start:       a short delay after boot (recovery pass runs first).
 *   3. Foreground:      returning to the foreground re-checks connectivity
 *                       (catches interruptions that happened while backgrounded)
 *                       and syncs immediately — no waiting for the next sweep.
 *   4. Periodic sweep:  every 60s while online, so temporary failures retry
 *                       even without a new connectivity transition.
 *                       (Per-entry backoff windows prevent hot-looping.)
 *   5. Manual:          retryFailedSync (the RETRY SYNC action) — the user
 *                       explicitly asks for a synchronization pass.
 *
 * Background execution: the current Expo configuration (Expo Go / no
 * background-fetch plugin, no native BGTaskScheduler / foreground service)
 * does NOT reliably support true background execution, so none is faked.
 * Foreground/resume synchronization above is the reliable mechanism for this
 * architecture. (All triggers funnel into the same single-flight, idempotent,
 * duplicate-safe syncPendingAssessments.)
 */
export const initSyncEngine = () => {
  if (initialized) return;
  initialized = true;

  // Deterministic recovery of interrupted uploads before any sync attempt
  void (async () => {
    await recoverQueuedAssessments();
    // Restore queue/disk consistency after restart (missing/corrupt videos,
    // interrupted temp artifacts), then clean orphaned files.
    await verifyQueueIntegrity();
    await cleanupOrphanedVideos();
  })();

  // (1) PRIMARY: offline -> online transition synchronizes pending assessments
  subscribeToNetwork(status => {
    if (status === 'online') void syncPendingAssessments();
  });

  // (2) App start: once shortly after boot (after recovery has had a chance)
  setTimeout(() => {
    if (getNetworkStatus() === 'online') void syncPendingAssessments();
  }, 3000);

  // (3) Foreground resume: re-check connectivity (interruptions while
  // backgrounded are not always delivered as NetInfo events), then sync.
  AppState.addEventListener('change', async appState => {
    if (appState !== 'active') return;
    const status = await refreshNetworkState();
    if (status === 'online') void syncPendingAssessments();
  });

  // (4) Periodic sweep so temporary failures retry even without a new
  // connectivity transition. Per-entry backoff windows prevent hot-looping.
  setInterval(() => {
    if (getNetworkStatus() === 'online') void syncPendingAssessments();
  }, 60000);
};

/**
 * Manual retry: re-queues ALL failed entries (including permanent/invalid ones —
 * the user explicitly asked) with a FRESH automatic-retry budget, and runs a
 * synchronization pass immediately. An unusable local recording is dropped to
 * metadata-only (retrying cannot restore a deleted/damaged file).
 */
export const retryFailedSync = async (): Promise<void> => {
  const queue = await getQueuedAssessments();
  for (const q of queue.filter(x => x.syncStatus === 'failed')) {
    const videoUnusable =
      q.errorCategory === 'video_unavailable' ||
      (q.errorCategory === 'upload_failed' &&
        /no longer available|damaged|reference is invalid/i.test(q.error || ''));
    await updateQueuedAssessment(q.localId, {
      syncStatus: 'pending',
      nextAttemptAt: null,
      retryCount: 0,
      localVideoUri: videoUnusable ? null : q.localVideoUri
    });
  }
  await syncPendingAssessments();
};

/**
 * Deterministic startup recovery for interrupted synchronization.
 *
 * - 'uploading' without serverId  ? back to 'pending' (upload never confirmed)
 * - 'uploading' with serverId     ? 'processing' (server already has the record)
 * - missing local video reference ? 'failed' with a recoverable reason
 * - completed entries are never touched; nothing is ever auto-deleted
 */
export const recoverQueuedAssessments = async (): Promise<void> => {
  try {
    const queue = await getQueuedAssessments();
    for (const entry of queue) {
      if (entry.syncStatus === 'uploading') {
        await updateQueuedAssessment(entry.localId, {
          syncStatus: entry.serverId ? 'processing' : 'pending'
        });
        continue;
      }
      if (entry.syncStatus !== 'completed' && entry.localVideoUri) {
        const problem = await describeVideoProblem(entry.localVideoUri);
        if (problem) {
          await updateQueuedAssessment(entry.localId, {
            syncStatus: 'failed',
            errorCategory: 'video_unavailable',
            error: problem,
            nextAttemptAt: null
          });
        }
      }
    }
  } catch (e: any) {
    console.warn('[SyncEngine] recovery failed:', e?.message);
    console.warn('[SyncEngine] recovery stack:', e?.stack?.split('\n').slice(0, 4).join(' | '));
  }
};
