import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtime } from '@/contexts/RealtimeContext';
import type { Project } from '@/lib/supabase/types';

export interface ProjectFilters {
  status?: string;
}

/**
 * Hook to subscribe to real-time project updates
 * Automatically fetches initial data and subscribes to changes
 */
export function useRealtimeProjects(filters?: ProjectFilters) {
  const { user } = useAuth();
  const { subscribe, isConnected } = useRealtime();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  // Memoize filters to prevent unnecessary re-fetches
  const filtersKey = useMemo(() => JSON.stringify(filters ?? {}), [filters]);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  
  // Debounce state updates to prevent excessive re-renders
  const updateQueueRef = useRef<Array<(prev: Project[]) => Project[]>>([]);
  const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const flushUpdates = useCallback(() => {
    if (updateQueueRef.current.length === 0) return;
    
    const updates = [...updateQueueRef.current];
    updateQueueRef.current = [];
    
    setProjects((prev) => {
      let result = prev;
      updates.forEach((update) => {
        result = update(result);
      });
      return result;
    });
  }, []);
  
  const queueUpdate = useCallback((update: (prev: Project[]) => Project[]) => {
    updateQueueRef.current.push(update);
    
    if (updateTimerRef.current) {
      clearTimeout(updateTimerRef.current);
    }
    
    updateTimerRef.current = setTimeout(() => {
      flushUpdates();
      updateTimerRef.current = null;
    }, 100); // Debounce by 100ms
  }, [flushUpdates]);

  // Fetch initial projects
  const fetchProjects = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setError(null);
      setLoading(true);

      let query = supabase
        .from('projects')
        .select('*');

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      query = query.order('created_at', { ascending: false }).limit(500); // Limit to prevent excessive data

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;
      setProjects(data ?? []);
    } catch (err) {
      console.error('Error fetching projects:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [user, filtersKey]);

  // Set up real-time subscription
  useEffect(() => {
    if (!user || !isConnected) {
      if (!user) {
        setProjects([]);
        setLoading(false);
      }
      return;
    }

    // Initial fetch
    fetchProjects();

    // Build filter string for subscription
    const filterParts: string[] = [];
    
    if (filters?.status) {
      filterParts.push(`status=eq.${filters.status}`);
    }

    const filterString = filterParts.length > 0 ? filterParts.join(',') : undefined;

    // Subscribe to project changes
    const unsubscribe = subscribe(
      `projects:${user.id}:${JSON.stringify(filters ?? {})}`,
      {
        event: '*',
        schema: 'public',
        table: 'projects',
        filter: filterString,
        callback: (payload) => {
          const currentFilters = filtersRef.current;
          
          if (payload.eventType === 'INSERT') {
            const newProject = payload.new as Project;
            
            // Check if project matches filters
            let matchesFilter = true;
            if (currentFilters?.status && newProject.status !== currentFilters.status) {
              matchesFilter = false;
            }

            if (matchesFilter) {
              queueUpdate((prev) => {
                // Check if project already exists (avoid duplicates)
                if (prev.some((p) => p.id === newProject.id)) {
                  return prev;
                }
                return [newProject, ...prev];
              });
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedProject = payload.new as Project;
            
            // Check if project still matches filters
            let matchesFilter = true;
            if (currentFilters?.status && updatedProject.status !== currentFilters.status) {
              matchesFilter = false;
            }

            queueUpdate((prev) => {
              const existingIndex = prev.findIndex((p) => p.id === updatedProject.id);
              
              if (existingIndex >= 0) {
                if (matchesFilter) {
                  // Update existing project
                  const updated = [...prev];
                  updated[existingIndex] = updatedProject;
                  return updated;
                } else {
                  // Remove if no longer matches filter
                  return prev.filter((p) => p.id !== updatedProject.id);
                }
              } else if (matchesFilter) {
                // Add if it now matches filter
                return [updatedProject, ...prev];
              }
              
              return prev;
            });
          } else if (payload.eventType === 'DELETE') {
            const deletedProject = payload.old as Project;
            queueUpdate((prev) => prev.filter((p) => p.id !== deletedProject.id));
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
      flushUpdates(); // Flush any pending updates
    };
  }, [user, isConnected, filtersKey, fetchProjects, subscribe, flushUpdates]);

  return { projects, loading, error, refetch: fetchProjects };
}
