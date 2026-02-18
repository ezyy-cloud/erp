import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtime } from '@/contexts/RealtimeContext';
import { listBulletins } from '@/lib/services/bulletinService';
import type { BulletinWithCreator } from '@/lib/services/bulletinService';

/**
 * Hook to subscribe to real-time bulletin updates
 * Automatically fetches initial data and subscribes to changes
 */
export function useRealtimeBulletins() {
  const { user } = useAuth();
  const { subscribe, isConnected } = useRealtime();
  const [bulletins, setBulletins] = useState<BulletinWithCreator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchBulletins = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setError(null);
      setLoading(true);

      const { data, error: fetchError } = await listBulletins();

      if (fetchError) throw fetchError;
      setBulletins(data ?? []);
    } catch (err) {
      console.error('Error fetching bulletins:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const debouncedRefetch = useCallback(() => {
    if (refetchTimerRef.current) {
      clearTimeout(refetchTimerRef.current);
    }
    refetchTimerRef.current = setTimeout(() => {
      fetchBulletins();
      refetchTimerRef.current = null;
    }, 300);
  }, [fetchBulletins]);

  // Set up real-time subscription
  useEffect(() => {
    if (!user || !isConnected) {
      if (!user) {
        setBulletins([]);
        setLoading(false);
      }
      return;
    }

    fetchBulletins();

    const unsubscribe = subscribe(
      `bulletins:${user.id}`,
      {
        event: '*',
        schema: 'public',
        table: 'bulletins',
        callback: () => {
          debouncedRefetch();
        },
      }
    );

    return () => {
      unsubscribe();
      if (refetchTimerRef.current) {
        clearTimeout(refetchTimerRef.current);
        refetchTimerRef.current = null;
      }
    };
  }, [user, isConnected, fetchBulletins, subscribe, debouncedRefetch]);

  return { bulletins, loading, error, refetch: fetchBulletins };
}
