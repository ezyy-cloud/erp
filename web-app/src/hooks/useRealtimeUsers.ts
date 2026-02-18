import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtime } from '@/contexts/RealtimeContext';
import { getAllUsers } from '@/lib/services/userService';
import type { UserWithRole } from '@/lib/supabase/types';

/**
 * Hook to subscribe to real-time user updates
 * Automatically fetches initial data and subscribes to changes
 * @param enabled - When false, skips fetch and subscription (e.g. when user lacks permission)
 */
export function useRealtimeUsers(enabled = true) {
  const { user } = useAuth();
  const { subscribe, isConnected } = useRealtime();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Debounce state updates to prevent excessive re-renders
  const updateQueueRef = useRef<Array<(prev: UserWithRole[]) => UserWithRole[]>>([]);
  const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushUpdates = useCallback(() => {
    if (updateQueueRef.current.length === 0) return;

    const updates = [...updateQueueRef.current];
    updateQueueRef.current = [];

    setUsers((prev) => {
      let result = prev;
      updates.forEach((update) => {
        result = update(result);
      });
      return result;
    });
  }, []);

  const queueUpdate = useCallback((update: (prev: UserWithRole[]) => UserWithRole[]) => {
    updateQueueRef.current.push(update);

    if (updateTimerRef.current) {
      clearTimeout(updateTimerRef.current);
    }

    updateTimerRef.current = setTimeout(() => {
      flushUpdates();
      updateTimerRef.current = null;
    }, 100); // Debounce by 100ms
  }, [flushUpdates]);

  const fetchUserWithRole = useCallback(async (userId: string): Promise<UserWithRole | null> => {
    const { data, error: fetchError } = await supabase
      .from('users')
      .select('*, roles:roles!users_role_id_fkey(*)')
      .eq('id', userId)
      .is('deleted_at', null)
      .single();

    if (fetchError ?? !data) return null;

    const u = data as any;
    return {
      ...u,
      roles: Array.isArray(u.roles) && u.roles.length > 0 ? u.roles[0] : (u.roles ?? null),
    } as UserWithRole;
  }, []);

  // Fetch initial users
  const fetchUsers = useCallback(async () => {
    if (!user || !enabled) {
      setLoading(false);
      return;
    }

    try {
      setError(null);
      setLoading(true);

      const data = await getAllUsers();
      setUsers((data as UserWithRole[]) ?? []);
    } catch (err) {
      console.error('Error fetching users:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [user, enabled]);

  // Set up real-time subscription
  useEffect(() => {
    if (!user || !isConnected || !enabled) {
      if (!user || !enabled) {
        setUsers([]);
        setLoading(false);
      }
      return;
    }

    // Initial fetch
    fetchUsers();

    // Subscribe to user changes
    const unsubscribe = subscribe(
      `users:${user.id}`,
      {
        event: '*',
        schema: 'public',
        table: 'users',
        callback: async (payload) => {
          if (payload.eventType === 'INSERT') {
            const newUser = payload.new as { id: string; deleted_at: string | null };
            if (newUser.deleted_at != null) return;
            const userWithRole = await fetchUserWithRole(newUser.id);
            if (userWithRole) {
              queueUpdate((prev) => {
                if (prev.some((u) => u.id === newUser.id)) return prev;
                return [userWithRole, ...prev];
              });
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedUser = payload.new as { id: string; deleted_at: string | null };
            if (updatedUser.deleted_at != null) {
              queueUpdate((prev) => prev.filter((u) => u.id !== updatedUser.id));
              return;
            }
            const userWithRole = await fetchUserWithRole(updatedUser.id);
            if (userWithRole) {
              queueUpdate((prev) => {
                const idx = prev.findIndex((u) => u.id === updatedUser.id);
                if (idx >= 0) {
                  const next = [...prev];
                  next[idx] = userWithRole;
                  return next;
                }
                return [userWithRole, ...prev];
              });
            }
          } else if (payload.eventType === 'DELETE') {
            const deletedUser = payload.old as { id?: string };
            if (deletedUser?.id) {
              queueUpdate((prev) => prev.filter((u) => u.id !== deletedUser.id));
            }
          }
        },
      }
    );

    return () => {
      unsubscribe();
      if (updateTimerRef.current) {
        clearTimeout(updateTimerRef.current);
        updateTimerRef.current = null;
      }
      flushUpdates();
    };
  }, [user, isConnected, enabled, fetchUsers, subscribe, flushUpdates, queueUpdate, fetchUserWithRole]);

  return { users, loading, error, refetch: fetchUsers };
}
