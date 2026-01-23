import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtime } from '@/contexts/RealtimeContext';
import type { TaskProgressLog } from '@/lib/services/taskProgressService';

/**
 * Hook to subscribe to real-time task progress log updates
 * Automatically fetches initial data and subscribes to changes
 */
export function useRealtimeProgressLogs(taskId: string) {
  const { user } = useAuth();
  const { subscribe, isConnected } = useRealtime();
  const [progressLogs, setProgressLogs] = useState<TaskProgressLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Fetch initial progress logs
  const fetchProgressLogs = useCallback(async () => {
    if (!user || !taskId) {
      setLoading(false);
      return;
    }

    try {
      setError(null);
      setLoading(true);

      const { data, error: fetchError } = await supabase
        .from('task_progress_log')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });

      if (fetchError) throw fetchError;
      setProgressLogs((data as TaskProgressLog[]) ?? []);
    } catch (err) {
      console.error('Error fetching progress logs:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [user, taskId]);

  // Set up real-time subscription
  useEffect(() => {
    if (!user || !isConnected || !taskId) {
      if (!user || !taskId) {
        setProgressLogs([]);
        setLoading(false);
      }
      return;
    }

    // Initial fetch
    fetchProgressLogs();

    // Subscribe to progress log changes for this task
    const unsubscribe = subscribe(
      `task_progress_log:${user.id}:${taskId}`,
      {
        event: 'INSERT',
        schema: 'public',
        table: 'task_progress_log',
        filter: `task_id=eq.${taskId}`,
        callback: (payload) => {
          if (payload.eventType === 'INSERT') {
            const newLog = payload.new as TaskProgressLog;
            setProgressLogs((prev) => {
              // Check if log already exists (avoid duplicates)
              if (prev.some((l) => l.id === newLog.id)) {
                return prev;
              }
              return [...prev, newLog];
            });
          }
        },
      }
    );

    return () => {
      unsubscribe();
    };
  }, [user, isConnected, taskId, fetchProgressLogs, subscribe]);

  return { progressLogs, loading, error, refetch: fetchProgressLogs };
}
