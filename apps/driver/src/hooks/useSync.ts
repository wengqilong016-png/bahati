import { useState, useCallback } from 'react';
import { startSync } from '../sync';
import { useOnlineStatus } from './useOnlineStatus';
import { useEffect } from 'react';

interface SyncState {
  isSyncing: boolean;
  lastSyncAt: Date | null;
  triggerSync: () => void;
}

export function useSync(): SyncState {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const isOnline = useOnlineStatus();

  const triggerSync = useCallback(() => {
    if (isSyncing) return;
    setIsSyncing(true);
    startSync().finally(() => {
      setIsSyncing(false);
      setLastSyncAt(new Date());
    });
  }, [isSyncing]);

  // Sync on mount
  useEffect(() => {
    triggerSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync when coming back online
  useEffect(() => {
    if (isOnline) {
      triggerSync();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  return { isSyncing, lastSyncAt, triggerSync };
}
