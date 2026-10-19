import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { getQueuedAssessments, updateQueuedAssessment, removeQueuedAssessment } from './assessmentQueue';

/**
 * Local video storage management for offline assessments (single source of truth).
 *
 * Videos live as individual files under <cacheDirectory>/offline-assessments/.
 * The queue stores ONLY the file reference (never binary data in AsyncStorage).
 *
 * Guarantees:
 *  1. PERSISTENCE — a video referenced by a queued entry is never deleted while
 *     that entry still needs synchronization (pending/uploading/processing) or
 *     can still be retried (failed).
 *  2. STABLE REFERENCE — filenames are derived from the entry's idempotency key
 *     (sanitized to filesystem-safe characters, collision-checked) plus the
 *     localId, so re-saving an entry can never overwrite another entry's video.
 *  3. INTEGRITY — writes go to a temp file first and are atomically moved into
 *     place; existence AND parseability are both verified (corruption detection).
 *  4. GUARDED DELETE — paths outside the managed directory are never touched;
 *     deletion happens only after confirmed completion (server confirmation
 *     via sync engine / finalization), matching the project storage policy.
 *  5. HYGIENE — files with no matching queue entry (abandoned recordings,
 *     crashed temp writes) are orphans and get cleaned on startup; stale .tmp
 *     files (interrupted recordings) are always removed.
 *
 * Edge cases handled: insufficient disk space (checked BEFORE writing),
 * invalid file URIs, missing files, interrupted recordings (temp leftovers),
 * app restart (files + queue references both persist; consistency is restored
 * by verifyQueueIntegrity()).
 */

const OFFLINE_DIR_NAME = 'offline-assessments';
const TEMP_SUFFIX = '.tmp';
/** Minimum free disk space required before accepting a new recording (bytes) */
export const MIN_FREE_DISK_BYTES = 50 * 1024 * 1024;

export type VideoIntegrity = 'ok' | 'missing' | 'corrupt' | 'invalid_uri';

export interface SaveVideoResult {
  ok: boolean;
  uri: string | null;
  error?: 'insufficient_storage' | 'write_failed' | 'verification_failed' | 'invalid_uri';
  message?: string;
}

export interface VideoProbe {
  status: VideoIntegrity;
  size: number | null;
}

/* ------------------------------------------------------------------ paths */

const getOfflineDir = (): string | null => {
  const base = (FileSystem as any).cacheDirectory;
  return base ? `${base}${OFFLINE_DIR_NAME}/` : null;
};

/** True when a URI lies inside the managed offline directory. */
const isManagedUri = (uri: string | null | undefined): boolean => {
  if (!uri) return false;
  const dir = getOfflineDir();
  if (!dir) return false;
  return uri.startsWith(dir);
};

/**
 * Filesystem-safe name derived from the entry's idempotency key.
 * Characters that are illegal on common mobile filesystems are folded to '-'.
 */
const sanitizeKeySegment = (key: string): string =>
  key.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-96) || 'entry';

/**
 * Stable, collision-proof file name for an assessment recording:
 * <sanitized-idempotency-key>--<localId>.json
 * The localId is unique per entry, so two different entries can never share
 * a file; the same entry re-saved always maps to the same path.
 */
export const buildVideoFileName = (idempotencyKey: string, localId: string): string =>
  `${sanitizeKeySegment(idempotencyKey)}--${localId}.json`;

/** Inverse of buildVideoFileName: never a temp file. */
export const isVideoFileReference = (uri: string | null | undefined): boolean =>
  !!uri && isManagedUri(uri) && !uri.endsWith(TEMP_SUFFIX);

/* ------------------------------------------------------------------ info */

const safeGetInfo = async (uri: string): Promise<{ exists: boolean; size?: number; isDirectory?: boolean }> => {
  try {
    const info = await FileSystem.getInfoAsync(uri, { size: true });
    return { exists: info.exists === true, size: (info as any).size, isDirectory: (info as any).isDirectory };
  } catch {
    return { exists: false };
  }
};

const safeDelete = async (uri: string): Promise<void> => {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {}
};

/**
 * Free disk space in bytes, or null when the platform cannot report it.
 */
export const getFreeDiskBytes = async (): Promise<number | null> => {
  try {
    const f: any = FileSystem as any;
    if (typeof f.getFreeDiskStorageAsync === 'function') {
      return await f.getFreeDiskStorageAsync();
    }
  } catch {}
  return null;
};

/**
 * Throws when there is not enough space to accept a new offline recording.
 * Called BEFORE the recording file is written.
 */
export const assertEnoughStorageForRecording = async (): Promise<void> => {
  const free = await getFreeDiskBytes();
  if (free != null && free < MIN_FREE_DISK_BYTES) {
    const mb = Math.round(free / (1024 * 1024));
    const err: any = new Error(
      `Not enough storage on this device (${mb} MB free). Free up space and try again.`
    );
    err.code = 'INSUFFICIENT_STORAGE';
    throw err;
  }
};

/* ------------------------------------------------------------------ write */

/**
 * Persist an offline recording payload ATOMICALLY and return its stable reference.
 *
 * Steps: storage check -> temp write -> integrity read-back (existence AND
 * content parse) -> atomic move into place -> final verification.
 * On any failure the temp file is removed so no corrupt artifact survives an
 * interrupted recording.
 */
export const saveRecording = async (
  idempotencyKey: string,
  localId: string,
  payload: Record<string, any>
): Promise<SaveVideoResult> => {
  const dir = getOfflineDir();
  if (!dir) {
    return { ok: false, uri: null, error: 'invalid_uri', message: 'Local storage is unavailable on this platform.' };
  }

  try {
    await assertEnoughStorageForRecording();
  } catch (e: any) {
    return { ok: false, uri: null, error: 'insufficient_storage', message: e?.message };
  }

  const finalUri = `${dir}${buildVideoFileName(idempotencyKey, localId)}`;
  const tempUri = `${finalUri}${TEMP_SUFFIX}`;

  try {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    // Remove leftovers from a previous interrupted attempt for THIS entry.
    await safeDelete(tempUri);

    await FileSystem.writeAsStringAsync(tempUri, JSON.stringify(payload));
    const tempInfo = await safeGetInfo(tempUri);
    if (!tempInfo.exists || (tempInfo.size ?? 0) === 0) {
      await safeDelete(tempUri);
      return { ok: false, uri: null, error: 'write_failed', message: 'Recording could not be written to disk.' };
    }

    // Read-back verification: existence alone is not enough (corruption check).
    const body = await FileSystem.readAsStringAsync(tempUri);
    JSON.parse(body); // throws on truncation/corruption

    await FileSystem.moveAsync({ from: tempUri, to: finalUri });
    const finalInfo = await safeGetInfo(finalUri);
    if (!finalInfo.exists || (finalInfo.size ?? 0) === 0) {
      await safeDelete(finalUri);
      return { ok: false, uri: null, error: 'verification_failed', message: 'Saved recording failed verification.' };
    }
    return { ok: true, uri: finalUri };
  } catch (e: any) {
    // Interrupted recording: remove the temp file so nothing corrupt survives.
    await safeDelete(tempUri);
    return { ok: false, uri: null, error: 'write_failed', message: e?.message || 'Recording save failed.' };
  }
};

/* ------------------------------------------------------------------ probe */

/**
 * Verify a queued entry's video reference.
 *  - 'ok'          file exists inside the managed dir AND content parses
 *  - 'missing'     file does not exist
 *  - 'corrupt'     exists but unreadable/unparseable
 *  - 'invalid_uri' null/empty or pointing outside the managed directory
 */
export const probeVideoReference = async (uri: string | null | undefined): Promise<VideoProbe> => {
  if (!uri) return { status: 'invalid_uri', size: null };
  if (!isManagedUri(uri)) return { status: 'invalid_uri', size: null };
  if (uri.endsWith(TEMP_SUFFIX)) return { status: 'invalid_uri', size: null };

  if (Platform.OS === 'web') {
    // Web cannot reliably stat arbitrary file:// paths — report existence only.
    return { status: 'ok', size: null };
  }

  const info = await safeGetInfo(uri);
  if (!info.exists || info.isDirectory) return { status: 'missing', size: null };

  try {
    const body = await FileSystem.readAsStringAsync(uri);
    JSON.parse(body);
    return { status: 'ok', size: info.size ?? null };
  } catch {
    return { status: 'corrupt', size: info.size ?? null };
  }
};

/**
 * Back-compat wrapper: the sync engine previously asked a boolean question.
 * Returns true ONLY when the reference is definitively broken; unverifiable
 * platforms (web) pass so synchronization is never blocked on this.
 */
export const isVideoReferenceMissing = async (uri: string | null): Promise<boolean> => {
  if (!uri) return false;
  if (Platform.OS === 'web') return false;
  const probe = await probeVideoReference(uri);
  // Missing reference can still sync metadata-only; corruption is recoverable
  // by re-save. Only a definitively absent file blocks nothing — report it.
  return probe.status === 'missing';
};

/* ------------------------------------------------------------------ delete */

/**
 * Remove a video file ONLY when it is safe to do so:
 *  - the URI must be inside the managed directory (foreign paths untouched)
 *  - no OTHER queued entry may reference the same file
 *  - the owning entry must not still need the video for synchronization
 *    (any non-completed status keeps the file)
 */
export const deleteVideoIfSafe = async (uri: string | null | undefined): Promise<boolean> => {
  if (!uri) return false;
  if (Platform.OS === 'web') return true; // nothing on disk on web
  if (!isManagedUri(uri)) {
    console.warn('[StorageManager] refused to delete unmanaged path:', uri);
    return false;
  }

  const queue = await getQueuedAssessments();
  const refs = queue.filter(q => q.localVideoUri === uri);

  // Referenced by an entry that still needs sync or retry -> keep the file.
  if (refs.some(q => q.syncStatus !== 'completed')) return false;

  // Completed (or orphaned by an entry that left the queue) -> safe to remove.
  await safeDelete(uri);
  return true;
};

/**
 * Deletes the local video file belonging to an entry identified by its server
 * assessment id. Called AFTER confirmed synchronization completion.
 *
 * Safety contract (Phase 11):
 *  - only removes the video when the entry's syncStatus is 'completed' or the
 *    server already confirmed completion (callers pass confirmCompleted=true
 *    from reconciliation); never for pending/uploading/failed entries
 *  - the file delete itself can never throw (safeDelete); if it fails the
 *    entry stays intact and a later sweep retries via cleanupCompletedEntries
 *  - the queue entry is removed only after the video is gone (or was never
 *    there) so the assessment itself remains valid and synchronized regardless
 *    of cleanup outcome
 */
export const deleteVideoForServerId = async (
  serverId: string,
  opts: { confirmCompleted?: boolean } = {}
): Promise<boolean> => {
  try {
    const queue = await getQueuedAssessments();
    const entry = queue.find(q => q.serverId === serverId);
    if (!entry) return false;

    // Guard: never delete the video of an entry that still needs it for
    // retry/synchronization — unless the caller confirms the server already
    // completed this assessment.
    const serverConfirmed = opts.confirmCompleted === true;
    if (entry.syncStatus !== 'completed' && !serverConfirmed) {
      console.warn(
        '[StorageManager] refused cleanup for not-yet-completed entry:',
        entry.localId,
        entry.syncStatus
      );
      return false;
    }

    if (entry.localVideoUri && Platform.OS !== 'web') {
      // Foreign/unmanaged paths are never touched
      if (!isManagedUri(entry.localVideoUri)) {
        console.warn('[StorageManager] refused to delete unmanaged path:', entry.localVideoUri);
      } else {
        await safeDelete(entry.localVideoUri);
      }
    }
    // Completed entries leave the queue entirely
    await removeQueuedAssessment(entry.localId);
    return true;
  } catch {
    return false;
  }
};

/**
 * Cleanup sweep for completed entries whose video files could not be removed
 * earlier (e.g. storage error at completion time, or the entry reached
 * 'completed' through a path that does not own cleanup). Also drops video
 * references so orphan cleanup can reclaim the files.
 *
 * Conservative by design: touches ONLY entries with syncStatus 'completed'.
 * If anything fails, entries remain valid and synchronized — cleanup retries
 * on the next sweep. Returns how many entries were cleaned.
 */
export const cleanupCompletedEntries = async (): Promise<number> => {
  let cleaned = 0;
  try {
    const queue = await getQueuedAssessments();
    for (const entry of queue) {
      if (entry.syncStatus !== 'completed') continue;
      if (!entry.localVideoUri) continue;

      if (Platform.OS !== 'web' && isManagedUri(entry.localVideoUri)) {
        await safeDelete(entry.localVideoUri);
        // Only drop the reference once the file is CONFIRMED gone (or never
        // existed) — a failed delete must not orphan the file silently.
        const info = await safeGetInfo(entry.localVideoUri);
        if (info.exists) {
          // Cleanup failed for this entry: keep the reference so the next
          // sweep retries; the assessment itself stays valid + synchronized.
          continue;
        }
      }
      // File confirmed gone (or web platform / unmanaged path): drop the
      // stale reference so nothing points at a nonexistent file.
      await updateQueuedAssessment(entry.localId, { localVideoUri: null });
      cleaned++;
    }
  } catch (e) {
    console.warn('[StorageManager] completed-entry cleanup skipped:', e);
  }
  return cleaned;
};

/* ------------------------------------------------------------------ hygiene */

/**
 * Removes orphaned recording files: files inside the managed directory that
 * are not referenced by ANY queue entry, plus stale .tmp artifacts from
 * interrupted recordings. Never touches files referenced by any entry,
 * including failed ones (they may still be retried).
 */
export const cleanupOrphanedVideos = async (): Promise<number> => {
  if (Platform.OS === 'web') return 0;
  const dir = getOfflineDir();
  if (!dir) return 0;

  let removed = 0;
  try {
    const queue = await getQueuedAssessments();
    const referenced = new Set(queue.map(q => q.localVideoUri).filter(Boolean) as string[]);

    const entries = await FileSystem.readDirectoryAsync(dir);
    for (const name of entries) {
      const uri = `${dir}${name}`;
      if (referenced.has(uri)) continue;
      const info = await safeGetInfo(uri);
      if (!info.exists || info.isDirectory) continue;
      await safeDelete(uri);
      removed++;
    }
  } catch (e) {
    console.warn('[StorageManager] orphan cleanup skipped:', e);
  }
  return removed;
};

/**
 * Startup consistency pass: after an app restart, reconcile queue references
 * with what is actually on disk.
 *  - broken/missing/corrupt video references on uncompleted entries are
 *    surfaced on the entry (recoverable; sync continues metadata-only later)
 *  - temp artifacts from interrupted recordings are removed
 *  - orphan cleanup runs afterwards
 */
export const verifyQueueIntegrity = async (): Promise<{
  checked: number;
  broken: { localId: string; status: VideoIntegrity }[];
}> => {
  const broken: { localId: string; status: VideoIntegrity }[] = [];
  let checked = 0;
  try {
    const queue = await getQueuedAssessments();
    for (const entry of queue) {
      if (entry.syncStatus === 'completed') continue;
      if (!entry.localVideoUri) continue;
      checked++;
      const probe = await probeVideoReference(entry.localVideoUri);
      if (probe.status === 'missing' || probe.status === 'corrupt' || probe.status === 'invalid_uri') {
        broken.push({ localId: entry.localId, status: probe.status });
        await updateQueuedAssessment(entry.localId, {
          syncStatus: 'failed',
          errorCategory: 'video_unavailable',
          error:
            probe.status === 'missing'
              ? 'Saved recording file is no longer available on this device. Retry will sync this assessment without the video.'
              : probe.status === 'corrupt'
                ? 'Saved recording file is damaged. Retry will sync this assessment without the video.'
                : 'Recording file reference is invalid. Retry will sync this assessment without the video.',
          nextAttemptAt: null
        });
      }
    }
  } catch (e) {
    console.warn('[StorageManager] integrity check failed:', e);
  }
  return { checked, broken };
};

/**
 * Full storage report for diagnostics/UI:
 * how many queued assessments carry local videos and their total size.
 */
export const getOfflineStorageSummary = async (): Promise<{
  queuedVideos: number;
  totalVideoBytes: number;
  freeBytes: number | null;
}> => {
  let queuedVideos = 0;
  let totalVideoBytes = 0;
  try {
    const queue = await getQueuedAssessments();
    for (const q of queue) {
      if (!q.localVideoUri) continue;
      const info = await safeGetInfo(q.localVideoUri);
      if (info.exists) {
        queuedVideos++;
        totalVideoBytes += info.size ?? 0;
      }
    }
  } catch {}
  const freeBytes = await getFreeDiskBytes();
  return { queuedVideos, totalVideoBytes, freeBytes };
};
