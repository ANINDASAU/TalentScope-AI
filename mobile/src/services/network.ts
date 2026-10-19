import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { AppState } from 'react-native';

export type NetworkStatus = 'online' | 'offline' | 'unknown';

/**
 * Centralized connectivity detection (singleton service).
 *
 * Consumers:
 *  - assessment flow (StartAssessmentScreen via useIsOnline)
 *  - offline queue / sync engine (getNetworkStatus + subscribeToNetwork)
 *  - UI components (OfflineBanner, AthleteDashboardScreen via useNetworkStatus)
 *
 * States:
 *  - 'online'  device connected AND internet not known-unreachable
 *  - 'offline' disconnected or reachability definitively failed
 *  - 'unknown' initializing — before the first reading arrives
 *
 * Transition policy:
 *  - any     -> OFFLINE applied immediately (data-safety first). This also
 *    cancels any pending online confirmation, so flapping is impossible.
 *  - UNKNOWN -> ONLINE  applied immediately on the first connected reading
 *    (if reachability later resolves false we drop to offline just as fast).
 *  - OFFLINE -> ONLINE  confirmed only after ONLINE_CONFIRMATION_MS of
 *    stable connectivity, so brief wifi <-> cellular handoffs and micro
 *    outages cannot flap the app between states. Readings where
 *    isInternetReachable is still unresolved (null — common on web) are
 *    treated as connected candidates, so the app can never get stuck
 *    offline while the interface is up.
 *
 * No polling: NetInfo pushes connectivity events; returning from background
 * re-queries once to catch interruptions that happened while suspended.
 */

const ONLINE_CONFIRMATION_MS = 2000;

let current: NetworkStatus = 'unknown';
let initialized = false;
let pendingOnlineTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<(s: NetworkStatus) => void>();

const notify = () => {
  listeners.forEach(listener => {
    try {
      listener(current);
    } catch (e) {
      console.warn('[Network] listener error', e);
    }
  });
};

const setStatus = (next: NetworkStatus) => {
  if (next === current) return;
  current = next;
  notify();
};

const clearPendingOnline = () => {
  if (pendingOnlineTimer !== null) {
    clearTimeout(pendingOnlineTimer);
    pendingOnlineTimer = null;
  }
};

/**
 * Pure mapping from a raw NetInfo state to our NetworkStatus.
 *  - not connected                       -> 'offline'
 *  - connected but reachability FAILED   -> 'offline' (definitive no-internet)
 *  - connected (reachability true/null)  -> 'online' candidate
 */
export const mapNetInfoState = (state: NetInfoState): NetworkStatus => {
  if (state.isConnected !== true) return 'offline';
  if (state.isInternetReachable === false) return 'offline';
  return 'online';
};

/**
 * Apply one connectivity reading using the transition policy above.
 */
const applyNetInfoState = (state: NetInfoState): void => {
  const next = mapNetInfoState(state);

  if (next === 'offline') {
    clearPendingOnline();
    setStatus('offline');
    return;
  }

  // next === 'online' (connected, internet not known-unreachable)
  if (current === 'online') return;

  if (current === 'unknown') {
    // First connected reading at startup: promote immediately so the online
    // flow is never blocked. A later definitive unreachable reading will
    // demote us just as fast.
    setStatus('online');
    return;
  }

  // OFFLINE -> ONLINE: require a stable window before trusting the link.
  if (pendingOnlineTimer !== null) return; // already confirming
  pendingOnlineTimer = setTimeout(() => {
    pendingOnlineTimer = null;
    setStatus('online');
  }, ONLINE_CONFIRMATION_MS);
};

const handleNetInfoChange = (state: NetInfoState) => {
  applyNetInfoState(state);
};

/**
 * Idempotently wires system connectivity listeners:
 * - NetInfo pushes changes (no polling)
 * - App foregrounding re-checks to catch interruptions that happened in background
 */
export const initNetworkListener = () => {
  if (initialized) return;
  initialized = true;

  void NetInfo.fetch().then(handleNetInfoChange).catch(() => {});
  NetInfo.addEventListener(handleNetInfoChange);

  AppState.addEventListener('change', appState => {
    if (appState === 'active') {
      void refreshNetworkState();
    }
  });
};

/** Re-query the device for fresh connectivity; resolves with the new status. */
export const refreshNetworkState = async (): Promise<NetworkStatus> => {
  try {
    const state = await NetInfo.fetch();
    handleNetInfoChange(state);
  } catch (e) {
    console.warn('[Network] refresh failed', e);
  }
  return current;
};

export const getNetworkStatus = (): NetworkStatus => current;

export const isOnline = (): boolean => current === 'online';

/** Subscribe to status changes. Returns an unsubscribe function. */
export const subscribeToNetwork = (listener: (s: NetworkStatus) => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
