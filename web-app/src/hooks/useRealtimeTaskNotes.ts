import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtime } from '@/contexts/RealtimeContext';
import type { TaskNote } from '@/lib/supabase/types';

/**
 * Hook to subscribe to real-time task note updates
 * Automatically fetches initial data and subscribes to changes
 */
export function useRealtimeTaskNotes(taskId: string) {
  const { user } = useAuth();
  const { subscribe, isConnected } = useRealtime();
  const [notes, setNotes] = useState<TaskNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Fetch initial notes
  const fetchNotes = useCallback(async () => {
    if (!user || !taskId) {
      setLoading(false);
      return;
    }

    try {
      setError(null);
      setLoading(true);

      const { data, error: fetchError } = await supabase
        .from('task_notes')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      // Fetch users separately
      if (data && data.length > 0) {
        const userIds = [...new Set(data.map((n: any) => n.user_id).filter(Boolean))];
        const { data: usersData } = userIds.length > 0
          ? await supabase.from('users').select('*').in('id', userIds)
          : { data: [] };

        const usersMap = new Map((usersData as any)?.map((u: any) => [u.id, u]) ?? []);

        const notesWithUsers = data.map((note: any) => ({
          ...note,
          user: usersMap.get(note.user_id) ?? null,
        }));

        setNotes(notesWithUsers as any);
      } else {
        setNotes([]);
      }
    } catch (err) {
      console.error('Error fetching notes:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [user, taskId]);

  // Set up real-time subscription
  useEffect(() => {
    if (!user || !isConnected || !taskId) {
      if (!user || !taskId) {
        setNotes([]);
        setLoading(false);
      }
      return;
    }

    // Initial fetch
    fetchNotes();

    // Subscribe to note changes for this task
    const unsubscribe = subscribe(
      `task_notes:${user.id}:${taskId}`,
      {
        event: '*',
        schema: 'public',
        table: 'task_notes',
        filter: `task_id=eq.${taskId}`,
        callback: async (payload) => {
          if (payload.eventType === 'INSERT') {
            const newNote = payload.new as TaskNote;
            
            // Fetch user for the note
            if (newNote.user_id) {
              const { data: userData } = await supabase
                .from('users')
                .select('*')
                .eq('id', newNote.user_id)
                .single();

              setNotes((prev) => {
                // Check if note already exists (avoid duplicates)
                if (prev.some((n) => n.id === newNote.id)) {
                  return prev;
                }
                return [
                  {
                    ...newNote,
                    user: userData ?? null,
                  } as any,
                  ...prev,
                ];
              });
            } else {
              setNotes((prev) => {
                if (prev.some((n) => n.id === newNote.id)) {
                  return prev;
                }
                return [{ ...newNote, user: null } as any, ...prev];
              });
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedNote = payload.new as TaskNote;
            setNotes((prev) =>
              prev.map((n) => (n.id === updatedNote.id ? { ...n, ...updatedNote } : n))
            );
          }
        },
      }
    );

    return () => {
      unsubscribe();
    };
  }, [user, isConnected, taskId, fetchNotes, subscribe]);

  return { notes, loading, error, refetch: fetchNotes };
}
