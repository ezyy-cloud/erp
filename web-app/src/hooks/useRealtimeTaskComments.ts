import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtime } from '@/contexts/RealtimeContext';
import type { TaskComment } from '@/lib/supabase/types';

/**
 * Hook to subscribe to real-time task comment updates
 * Automatically fetches initial data and subscribes to changes
 */
export function useRealtimeTaskComments(taskId: string) {
  const { user } = useAuth();
  const { subscribe, isConnected } = useRealtime();
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Fetch initial comments
  const fetchComments = useCallback(async () => {
    if (!user || !taskId) {
      setLoading(false);
      return;
    }

    try {
      setError(null);
      setLoading(true);

      const { data, error: fetchError } = await supabase
        .from('task_comments')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });

      if (fetchError) throw fetchError;

      // Fetch users separately
      if (data && data.length > 0) {
        const userIds = [...new Set(data.map((c: any) => c.user_id).filter(Boolean))];
        const { data: usersData } = userIds.length > 0
          ? await supabase.from('users').select('*').in('id', userIds)
          : { data: [] };

        const usersMap = new Map((usersData as any)?.map((u: any) => [u.id, u]) ?? []);

        const commentsWithUsers = data.map((comment: any) => ({
          ...comment,
          user: usersMap.get(comment.user_id) ?? null,
        }));

        setComments(commentsWithUsers as any);
      } else {
        setComments([]);
      }
    } catch (err) {
      console.error('Error fetching comments:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [user, taskId]);

  // Set up real-time subscription
  useEffect(() => {
    if (!user || !isConnected || !taskId) {
      if (!user || !taskId) {
        setComments([]);
        setLoading(false);
      }
      return;
    }

    // Initial fetch
    fetchComments();

    // Subscribe to comment changes for this task
    const unsubscribe = subscribe(
      `task_comments:${user.id}:${taskId}`,
      {
        event: '*',
        schema: 'public',
        table: 'task_comments',
        filter: `task_id=eq.${taskId}`,
        callback: async (payload) => {
          if (payload.eventType === 'INSERT') {
            const newComment = payload.new as TaskComment;
            
            // Fetch user for the comment
            if (newComment.user_id) {
              const { data: userData } = await supabase
                .from('users')
                .select('*')
                .eq('id', newComment.user_id)
                .single();

              setComments((prev) => {
                // Check if comment already exists (avoid duplicates)
                if (prev.some((c) => c.id === newComment.id)) {
                  return prev;
                }
                return [
                  ...prev,
                  {
                    ...newComment,
                    user: userData ?? null,
                  } as any,
                ];
              });
            } else {
              setComments((prev) => {
                if (prev.some((c) => c.id === newComment.id)) {
                  return prev;
                }
                return [...prev, { ...newComment, user: null } as any];
              });
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedComment = payload.new as TaskComment;
            setComments((prev) =>
              prev.map((c) => (c.id === updatedComment.id ? { ...c, ...updatedComment } : c))
            );
          } else if (payload.eventType === 'DELETE') {
            const deletedComment = payload.old as TaskComment;
            setComments((prev) => prev.filter((c) => c.id !== deletedComment.id));
          }
        },
      }
    );

    return () => {
      unsubscribe();
    };
  }, [user, isConnected, taskId, fetchComments, subscribe]);

  return { comments, loading, error, refetch: fetchComments };
}
