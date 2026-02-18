import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtime } from '@/contexts/RealtimeContext';
import { listTodosWithAssigneesAndCompletions } from '@/lib/services/todoService';
import type { TodoWithRelations } from '@/lib/services/todoService';

/**
 * Hook to subscribe to real-time todo updates
 * Subscribes to todo_items, todo_assignees, and todo_completions - refetches on any change
 */
export function useRealtimeTodos() {
  const { user } = useAuth();
  const { subscribe, isConnected } = useRealtime();
  const [todos, setTodos] = useState<TodoWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchTodos = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setError(null);
      setLoading(true);

      const { data, error: fetchError } = await listTodosWithAssigneesAndCompletions();

      if (fetchError) throw fetchError;
      setTodos(data ?? []);
    } catch (err) {
      console.error('Error fetching todos:', err);
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
      fetchTodos();
      refetchTimerRef.current = null;
    }, 300);
  }, [fetchTodos]);

  // Set up real-time subscriptions for all todo-related tables
  useEffect(() => {
    if (!user || !isConnected) {
      if (!user) {
        setTodos([]);
        setLoading(false);
      }
      return;
    }

    fetchTodos();

    const unsubItems = subscribe(
      `todo_items:${user.id}`,
      {
        event: '*',
        schema: 'public',
        table: 'todo_items',
        callback: debouncedRefetch,
      }
    );

    const unsubAssignees = subscribe(
      `todo_assignees:${user.id}`,
      {
        event: '*',
        schema: 'public',
        table: 'todo_assignees',
        callback: debouncedRefetch,
      }
    );

    const unsubCompletions = subscribe(
      `todo_completions:${user.id}`,
      {
        event: '*',
        schema: 'public',
        table: 'todo_completions',
        callback: debouncedRefetch,
      }
    );

    return () => {
      unsubItems();
      unsubAssignees();
      unsubCompletions();
      if (refetchTimerRef.current) {
        clearTimeout(refetchTimerRef.current);
        refetchTimerRef.current = null;
      }
    };
  }, [user, isConnected, fetchTodos, subscribe, debouncedRefetch]);

  return { todos, loading, error, refetch: fetchTodos };
}
