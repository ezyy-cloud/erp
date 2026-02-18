import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { TaskComment } from '@/lib/supabase/types';

export interface TaskCommentWithUser extends TaskComment {
  user?: { id: string; full_name: string | null; email: string } | null;
}

/**
 * Fetches the latest comment for each task in the given list.
 * Returns a Map of taskId -> latest comment (or undefined if none).
 */
export function useLatestTaskComments(taskIds: string[]) {
  const { user } = useAuth();
  const [latestByTask, setLatestByTask] = useState<Map<string, TaskCommentWithUser>>(new Map());

  const idsKey = useMemo(() => taskIds.slice(0, 100).sort().join(','), [taskIds]);

  useEffect(() => {
    if (!user || taskIds.length === 0) {
      setLatestByTask(new Map());
      return;
    }

    const ids = taskIds.slice(0, 100);

    supabase
      .from('task_comments')
      .select('*')
      .in('task_id', ids)
      .order('created_at', { ascending: false })
      .limit(ids.length * 5)
      .then(async ({ data, error }) => {
        if (error) {
          console.error('Error fetching latest comments:', error);
          setLatestByTask(new Map());
          return;
        }
        const map = new Map<string, TaskCommentWithUser>();
        for (const row of data ?? []) {
          const c = row as TaskComment;
          if (!map.has(c.task_id)) {
            map.set(c.task_id, { ...c } as TaskCommentWithUser);
          }
        }
        const userIds = [...new Set((data ?? []).map((r: any) => r.user_id).filter(Boolean))];
        let resultMap = map;
        if (userIds.length > 0) {
          const { data: usersData } = await supabase
            .from('users')
            .select('id, full_name, email')
            .in('id', userIds);
          const usersMap = new Map((usersData as any)?.map((u: any) => [u.id, u]) ?? []);
          resultMap = new Map(
            Array.from(map.entries()).map(([taskId, comment]) => {
              const u = (comment as any).user_id ? usersMap.get((comment as any).user_id) : null;
              return [taskId, { ...comment, user: u ?? null } as TaskCommentWithUser];
            })
          );
        }
        setLatestByTask(resultMap);
      });
  }, [user, idsKey]);

  return latestByTask;
}
