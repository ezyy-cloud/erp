import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtime } from '@/contexts/RealtimeContext';
import { getEditRequests } from '@/lib/services/taskEditRequestService';
import type { TaskEditRequest } from '@/lib/supabase/types';

/**
 * Hook to subscribe to real-time task edit request updates
 * @param taskId - The task ID to fetch edit requests for
 */
export function useRealtimeTaskEditRequests(taskId: string | undefined) {
  const { user } = useAuth();
  const { subscribe, isConnected } = useRealtime();
  const [editRequests, setEditRequests] = useState<TaskEditRequest[]>([]);

  const fetchEditRequests = useCallback(async () => {
    if (!user || !taskId) return;

    const { data, error } = await getEditRequests(taskId);
    if (!error && data) {
      setEditRequests(data);
    }
  }, [user, taskId]);

  useEffect(() => {
    if (!user || !isConnected || !taskId) {
      if (!taskId) {
        setEditRequests([]);
      }
      return;
    }

    fetchEditRequests();

    const unsubscribe = subscribe(
      `task_edit_requests:${user.id}:${taskId}`,
      {
        event: '*',
        schema: 'public',
        table: 'task_edit_requests',
        filter: `task_id=eq.${taskId}`,
        callback: () => {
          fetchEditRequests();
        },
      }
    );

    return () => unsubscribe();
  }, [user, isConnected, taskId, fetchEditRequests, subscribe]);

  const pendingEditRequest = editRequests.find((req) => req.status === 'pending') ?? null;

  return { editRequests, pendingEditRequest, refetch: fetchEditRequests };
}
