import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';

export interface NetworkStateSnapshot {
  connected: boolean;
  connectionType: string;
}

type NetworkListener = (state: NetworkStateSnapshot) => void;

const listeners = new Set<NetworkListener>();
let currentState: NetworkStateSnapshot = {
  connected: typeof navigator !== 'undefined' ? navigator.onLine : true,
  connectionType: 'unknown',
};
let initialized = false;

function notify(next: NetworkStateSnapshot): void {
  const changed =
    currentState.connected !== next.connected ||
    currentState.connectionType !== next.connectionType;
  currentState = next;
  if (changed) {
    listeners.forEach((cb) => {
      try {
        cb(next);
      } catch {
        // isolate subscriber errors
      }
    });
  }
}

export async function initNetworkMonitor(): Promise<NetworkStateSnapshot> {
  if (initialized) return currentState;
  initialized = true;

  if (Capacitor.isNativePlatform()) {
    try {
      const status = await Network.getStatus();
      notify({ connected: status.connected, connectionType: status.connectionType });
      await Network.addListener('networkStatusChange', (status) => {
        notify({ connected: status.connected, connectionType: status.connectionType });
      });
      return currentState;
    } catch {
      // fallback to browser events below
    }
  }

  if (typeof window !== 'undefined') {
    const syncBrowserStatus = () => {
      notify({
        connected: navigator.onLine,
        connectionType: navigator.onLine ? 'wifi' : 'none',
      });
    };
    window.addEventListener('online', syncBrowserStatus);
    window.addEventListener('offline', syncBrowserStatus);
    syncBrowserStatus();
  }

  return currentState;
}

export function getNetworkSnapshot(): NetworkStateSnapshot {
  return currentState;
}

export function isOnline(): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return false;
  }
  return currentState.connected;
}

export function subscribeNetworkStatus(listener: NetworkListener): () => void {
  listeners.add(listener);
  void initNetworkMonitor();
  return () => {
    listeners.delete(listener);
  };
}
