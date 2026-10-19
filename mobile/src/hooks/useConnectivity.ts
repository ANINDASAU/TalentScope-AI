import { useEffect, useState } from 'react';
import {
  NetworkStatus,
  getNetworkStatus,
  initNetworkListener,
  subscribeToNetwork
} from '../services/network';

/**
 * Reusable connectivity hook. Returns 'online' | 'offline' | 'unknown'
 * and re-renders the component whenever the network state changes.
 */
export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>(getNetworkStatus);

  useEffect(() => {
    initNetworkListener();
    setStatus(getNetworkStatus());
    return subscribeToNetwork(setStatus);
  }, []);

  return status;
}

export function useIsOnline(): boolean {
  return useNetworkStatus() === 'online';
}
