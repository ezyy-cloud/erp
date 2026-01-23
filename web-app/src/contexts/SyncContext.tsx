import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { retryAllPending, getQueueStats } from '@/lib/pwa/offlineQueue';

export type SyncStatus = 'synced' | 'syncing' | 'pending' | 'error';

interface SyncContextType {
  syncStatus: SyncStatus;
  pendingCount: number;
  failedCount: number;
  lastSyncTime: number | null;
  syncError: string | null;
  retrySync: () => Promise<void>;
  queueStats: {
    pending: number;
    processing: number;
    failed: number;
  } | null;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

interface SyncProviderProps {
  children: ReactNode;
}

export function SyncProvider({ children }: SyncProviderProps) {
  const { isOnline, wasOffline } = useNetworkStatus();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [queueStats, setQueueStats] = useState<{
    pending: number;
    processing: number;
    failed: number;
  } | null>(null);

  // Update queue stats
  const updateQueueStats = useCallback(async () => {
    try {
      const stats = await getQueueStats();
      setQueueStats(stats);
      setPendingCount(stats.pending);
      setFailedCount(stats.failed);
      
      // Update sync status based on queue state
      if (stats.pending > 0 || stats.processing > 0) {
        setSyncStatus(stats.processing > 0 ? 'syncing' : 'pending');
      } else if (stats.failed > 0) {
        setSyncStatus('error');
      } else {
        setSyncStatus('synced');
      }
    } catch (error) {
      console.error('[SyncContext] Failed to update queue stats:', error);
    }
  }, []);

  // Retry sync
  const retrySync = useCallback(async () => {
    if (!isOnline) {
      setSyncError('Cannot sync while offline');
      return;
    }

    setSyncStatus('syncing');
    setSyncError(null);

    try {
      const result = await retryAllPending();
      setLastSyncTime(Date.now());
      
      if (result.failed > 0) {
        setSyncStatus('error');
        setSyncError(`${result.failed} operation(s) failed after retries`);
      } else {
        setSyncStatus('synced');
      }
      
      // Update stats after sync
      await updateQueueStats();
    } catch (error) {
      setSyncStatus('error');
      setSyncError(error instanceof Error ? error.message : 'Sync failed');
      console.error('[SyncContext] Sync failed:', error);
    }
  }, [isOnline, updateQueueStats]);

  // Auto-sync when coming back online
  useEffect(() => {
    if (wasOffline && isOnline) {
      // Small delay to ensure network is stable
      const timer = setTimeout(() => {
        updateQueueStats().then(() => {
          if (pendingCount > 0) {
            retrySync();
          }
        });
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [wasOffline, isOnline, pendingCount, retrySync, updateQueueStats]);

  // Update stats periodically when online
  useEffect(() => {
    if (!isOnline) {
      return;
    }

    // Initial stats
    updateQueueStats();

    // Update stats every 30 seconds (reduced frequency for better performance)
    const interval = setInterval(() => {
      updateQueueStats();
    }, 30000);

    return () => clearInterval(interval);
  }, [isOnline, updateQueueStats]);

  // Update status based on online state
  useEffect(() => {
    if (!isOnline) {
      setSyncStatus('pending');
    } else if (syncStatus === 'pending' && pendingCount === 0) {
      setSyncStatus('synced');
    }
  }, [isOnline, syncStatus, pendingCount]);

  return (
    <SyncContext.Provider
      value={{
        syncStatus,
        pendingCount,
        failedCount,
        lastSyncTime,
        syncError,
        retrySync,
        queueStats,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const context = useContext(SyncContext);
  if (context === undefined) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
}
