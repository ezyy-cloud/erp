import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtime } from '@/contexts/RealtimeContext';
import type { Task, Project, UserWithRole } from '@/lib/supabase/types';
import { TaskStatus } from '@/lib/supabase/types';

export interface TaskFilters {
  status?: string; // Legacy status support
  taskStatus?: string; // Canonical lifecycle status: 'ToDo', 'Work-In-Progress', 'Done', 'Closed'
  reviewStatus?: string; // Legacy review status support
  projectId?: string;
  assignedTo?: string;
  includeArchived?: boolean; // Set to true to include archived tasks (Super Admin only)
  searchQuery?: string; // Search query for text search across title, description, project name, assignees, status, due date
}

export interface TaskWithRelations extends Task {
  projects?: Project | null;
  assigned_user?: UserWithRole | null; // Legacy single assignee (deprecated)
  assignees?: (UserWithRole & { assigned_at: string })[];
}

/**
 * Hook to subscribe to real-time task updates
 * Automatically fetches initial data and subscribes to changes
 */
export function useRealtimeTasks(filters?: TaskFilters) {
  const { user } = useAuth();
  const { subscribe, isConnected } = useRealtime();
  const [tasks, setTasks] = useState<TaskWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  // Memoize filters to prevent unnecessary re-fetches
  const filtersKey = useMemo(() => JSON.stringify(filters ?? {}), [filters]);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  
  // Debounce state updates to prevent excessive re-renders
  const updateQueueRef = useRef<Array<(prev: TaskWithRelations[]) => TaskWithRelations[]>>([]);
  const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const flushUpdates = useCallback(() => {
    if (updateQueueRef.current.length === 0) return;
    
    const updates = [...updateQueueRef.current];
    updateQueueRef.current = [];
    
    setTasks((prev) => {
      let result = prev;
      updates.forEach((update) => {
        result = update(result);
      });
      return result;
    });
  }, []);
  
  const queueUpdate = useCallback((update: (prev: TaskWithRelations[]) => TaskWithRelations[]) => {
    updateQueueRef.current.push(update);
    
    if (updateTimerRef.current) {
      clearTimeout(updateTimerRef.current);
    }
    
    updateTimerRef.current = setTimeout(() => {
      flushUpdates();
      updateTimerRef.current = null;
    }, 100); // Debounce by 100ms
  }, [flushUpdates]);

  // Fetch initial tasks
  const fetchTasks = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setError(null);
      setLoading(true);

      // Build query with filters
      let query = supabase
        .from('tasks')
        .select(`
          *,
          projects!left (*)
        `);

      // Always exclude soft-deleted tasks from normal views.
      // Super Admins have a separate view (getDeletedTasks) for managing deleted tasks.
      query = query.is('deleted_at', null);

      // Exclude archived tasks from default views (unless explicitly requested)
      // RLS policies should handle this, but we add explicit filter for clarity
      // Exception: when viewing closed tasks, we want to see archived tasks
      if (!filters?.includeArchived && filters?.taskStatus !== 'Closed' && filters?.status !== 'closed') {
        query = query.is('archived_at', null);
      }

      // Apply canonical lifecycle status filter (preferred)
      if (filters?.taskStatus) {
        // Ensure we're filtering by the exact status value
        query = query.eq('task_status', filters.taskStatus);
      }
      // Legacy status filter support (for backward compatibility)
      else if (filters?.status) {
        if (filters.status === 'closed') {
          // Completed tasks include both "done" (pending review) and "closed" (archived)
          // This shows tasks that are done (pending review) and tasks that are closed (archived)
          query = query.in('status', [TaskStatus.CLOSED, TaskStatus.DONE]);
        } else if (filters.status === 'to_do') {
          query = query.eq('status', TaskStatus.TO_DO);
        } else if (filters.status === 'in_progress') {
          query = query.eq('status', TaskStatus.IN_PROGRESS);
        } else if (filters.status === 'blocked') {
          query = query.eq('status', TaskStatus.BLOCKED);
        } else if (filters.status === 'done') {
          query = query.eq('status', TaskStatus.DONE);
        } else if (filters.status === 'due_today') {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);
          query = query
            .gte('due_date', today.toISOString())
            .lt('due_date', tomorrow.toISOString())
            .neq('status', TaskStatus.CLOSED);
        } else if (filters.status === 'overdue') {
          const now = new Date().toISOString();
          query = query
            .lt('due_date', now)
            .neq('status', TaskStatus.CLOSED)
            .neq('status', TaskStatus.DONE);
        }
      }

      // Legacy review status filter (for backward compatibility)
      if (filters?.reviewStatus) {
        query = query.eq('review_status', filters.reviewStatus);
      }

      if (filters?.projectId) {
        query = query.eq('project_id', filters.projectId);
      }

      // Note: assignedTo filter should use task_assignees table, but for backward compatibility
      // we'll filter by assigned_to as well. In the future, this should be updated to use task_assignees.
      if (filters?.assignedTo) {
        query = query.eq('assigned_to', filters.assignedTo);
      }

      // Apply search query filter
      // Search across: title, description, task_status, project name (via join), assignee names (post-fetch)
      if (filters?.searchQuery && filters.searchQuery.trim().length > 0) {
        const searchTerm = filters.searchQuery.trim();
        const searchPattern = `%${searchTerm}%`;
        
        // Search in task fields: title, description, task_status
        // Use or() with properly formatted filter string
        // Format: "field1.ilike.pattern,field2.ilike.pattern"
        const searchFilter = `title.ilike.${searchPattern},description.ilike.${searchPattern},task_status.ilike.${searchPattern}`;
        query = query.or(searchFilter);
        
        // For due date search, we'll handle it post-fetch since date formatting varies
        // For project name and assignee names, we'll filter post-fetch for better performance
      }

      query = query.order('created_at', { ascending: false });

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      // Fetch assigned users and assignees efficiently
      if (data && data.length > 0) {
        const taskIds = data.map((t: any) => t.id);
        const userIds = [...new Set(data.map((t: any) => t.assigned_to).filter(Boolean))];

        // Fetch all users with roles in a single query
        let usersMap = new Map();
        if (userIds.length > 0) {
          const { data: usersData } = await supabase
            .from('users')
            .select('*, roles:roles!users_role_id_fkey(*)')
            .in('id', userIds);

          if (usersData) {
            usersMap = new Map(
              usersData.map((u: any) => {
                const user = {
                  ...u,
                  roles: Array.isArray(u.roles) && u.roles.length > 0 ? u.roles[0] : (u.roles ?? null),
                };
                return [u.id, user];
              })
            );
          }
        }

        // Fetch task assignees (multi-assignee support)
        const { data: assigneesData } = await supabase
          .from('task_assignees')
          .select('task_id, user_id, assigned_at')
          .in('task_id', taskIds);

        // Build assignees map by task_id
        const assigneesMap = new Map<string, (UserWithRole & { assigned_at: string })[]>();
        if (assigneesData && assigneesData.length > 0) {
          const assigneeUserIds = [
            ...new Set(assigneesData.map((assignee: any) => assignee.user_id).filter(Boolean)),
          ];
          const { data: assigneeUsersData } = assigneeUserIds.length > 0
            ? await supabase.from('users').select('*, roles:roles!users_role_id_fkey(*)').in('id', assigneeUserIds)
            : { data: [] };
          const assigneeUsersMap = new Map(
            (assigneeUsersData ?? []).map((u: any) => {
              const user = {
                ...u,
                roles: Array.isArray(u.roles) && u.roles.length > 0 ? u.roles[0] : (u.roles ?? null),
              };
              return [u.id, user];
            })
          );

          assigneesData.forEach((assignee: any) => {
            const taskId = assignee.task_id;
            if (!assigneesMap.has(taskId)) {
              assigneesMap.set(taskId, []);
            }
            const user = assigneeUsersMap.get(assignee.user_id) ?? null;
            if (user) {
              assigneesMap.get(taskId)!.push({
                ...user,
                assigned_at: assignee.assigned_at,
              });
            }
          });
        }

        let tasksWithRelations = data.map((task: any) => ({
          ...task,
          projects: task.projects ?? null,
          assigned_user: task.assigned_to ? usersMap.get(task.assigned_to) ?? null : null, // Legacy
          assignees: assigneesMap.get(task.id) ?? [],
        }));

        // Post-fetch filtering for project name, assignee names, and due date
        if (filters?.searchQuery && filters.searchQuery.trim().length > 0) {
          const searchTerm = filters.searchQuery.trim().toLowerCase();
          
          tasksWithRelations = tasksWithRelations.filter((task: any) => {
            // Check project name
            const projectName = task.projects?.name?.toLowerCase() ?? '';
            if (projectName.includes(searchTerm)) return true;
            
            // Check assignee names (both legacy and multi-assignee)
            const assignedUserName = task.assigned_user?.full_name?.toLowerCase() ?? task.assigned_user?.email?.toLowerCase() ?? '';
            if (assignedUserName.includes(searchTerm)) return true;
            
            const assigneeNames = (task.assignees ?? [])
              .map((a: any) => a.full_name?.toLowerCase() ?? a.email?.toLowerCase() ?? '')
              .join(' ');
            if (assigneeNames.includes(searchTerm)) return true;
            
            // Check due date (format as readable date string)
            if (task.due_date) {
              try {
                const dueDate = new Date(task.due_date);
                const dateStr = dueDate.toLocaleDateString().toLowerCase();
                const timeStr = dueDate.toLocaleTimeString().toLowerCase();
                if (dateStr.includes(searchTerm) || timeStr.includes(searchTerm)) return true;
              } catch (e) {
                // Ignore date parsing errors
              }
            }
            
            // If none of the above matched, the task was already filtered by server-side search
            // (title, description, task_status), so include it
            return true;
          });
        }

        setTasks(tasksWithRelations as TaskWithRelations[]);
      } else {
        setTasks([]);
      }
    } catch (err) {
      console.error('Error fetching tasks:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [user, filtersKey]);

  // Set up real-time subscription
  useEffect(() => {
    if (!user || !isConnected) {
      if (!user) {
        setTasks([]);
        setLoading(false);
      }
      return;
    }

    // Initial fetch
    fetchTasks();

    // Build filter string for subscription
    // Note: RLS will automatically filter based on user permissions
    // We can add additional filters here if needed
    const filterParts: string[] = [];
    
    if (filters?.projectId) {
      filterParts.push(`project_id=eq.${filters.projectId}`);
    }
    
    if (filters?.assignedTo) {
      filterParts.push(`assigned_to=eq.${filters.assignedTo}`);
    }

    const filterString = filterParts.length > 0 ? filterParts.join(',') : undefined;

    // Subscribe to task changes
    const unsubscribe = subscribe(
      `tasks:${user.id}:${JSON.stringify(filters ?? {})}`,
      {
        event: '*',
        schema: 'public',
        table: 'tasks',
        filter: filterString,
        callback: (payload: any) => {
          const currentFilters = filtersRef.current;
          
          if (payload.eventType === 'INSERT') {
            // Use payload data directly, fetch relations in parallel if needed
            const newTask = payload.new as any;
            
            // Check if task matches current filters
            let matchesFilter = true;
            
            // Check canonical lifecycle status filter (preferred)
            if (currentFilters?.taskStatus) {
              if (newTask.task_status !== currentFilters.taskStatus) {
                matchesFilter = false;
              }
            }
            // Legacy status filter support
            else if (currentFilters?.status) {
              if (currentFilters.status === 'closed' && newTask.status !== TaskStatus.CLOSED) {
                matchesFilter = false;
              } else if (currentFilters.status === 'to_do' && newTask.status !== TaskStatus.TO_DO) {
                matchesFilter = false;
              } else if (currentFilters.status === 'in_progress' && newTask.status !== TaskStatus.IN_PROGRESS) {
                matchesFilter = false;
              } else if (currentFilters.status === 'blocked' && newTask.status !== TaskStatus.BLOCKED) {
                matchesFilter = false;
              } else if (currentFilters.status === 'done' && newTask.status !== TaskStatus.DONE) {
                matchesFilter = false;
              }
            }

            if (currentFilters?.reviewStatus && newTask.review_status !== currentFilters.reviewStatus) {
              matchesFilter = false;
            }

            if (matchesFilter) {
              // Fetch relations in parallel
              const promises: Promise<any>[] = [];
              
              // Fetch project if project_id exists
              if (newTask.project_id) {
                promises.push(
                  Promise.resolve(
                    supabase
                      .from('projects')
                      .select('*')
                      .eq('id', newTask.project_id)
                      .single()
                      .then(({ data }) => data)
                  )
                );
              } else {
                promises.push(Promise.resolve(null));
              }
              
              // Fetch assigned user if assigned_to exists
              if (newTask.assigned_to) {
                promises.push(
                  Promise.resolve(
                    supabase
                      .from('users')
                      .select('*, roles(*)')
                      .eq('id', newTask.assigned_to)
                      .single()
                      .then(({ data }) => {
                        if (data) {
                          const user = data as any;
                          return {
                            ...user,
                            roles: Array.isArray(user.roles) ? user.roles[0] : user.roles,
                          };
                        }
                        return null;
                      })
                  )
                );
              } else {
                promises.push(Promise.resolve(null));
              }
              
              Promise.all(promises).then(([project, assignedUser]) => {
                queueUpdate((prev) => {
                  // Check if task already exists (avoid duplicates)
                  if (prev.some((t) => t.id === newTask.id)) {
                    return prev;
                  }
                  return [
                    {
                      ...newTask,
                      projects: project ?? null,
                      assigned_user: assignedUser ?? null,
                    } as TaskWithRelations,
                    ...prev,
                  ];
                });
              });
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedTask = payload.new as any;
            
            // Check if task still matches filters
            let matchesFilter = true;
            
            // Exclude soft-deleted tasks from the list
            if (updatedTask.deleted_at) {
              matchesFilter = false;
            }

            // Check canonical lifecycle status filter (preferred)
            if (currentFilters?.taskStatus) {
              if (updatedTask.task_status !== currentFilters.taskStatus) {
                matchesFilter = false;
              }
            }
            // Legacy status filter support
            else if (currentFilters?.status) {
              if (currentFilters.status === 'closed' && updatedTask.status !== TaskStatus.CLOSED) {
                matchesFilter = false;
              } else if (currentFilters.status === 'to_do' && updatedTask.status !== TaskStatus.TO_DO) {
                matchesFilter = false;
              } else if (currentFilters.status === 'in_progress' && updatedTask.status !== TaskStatus.IN_PROGRESS) {
                matchesFilter = false;
              } else if (currentFilters.status === 'blocked' && updatedTask.status !== TaskStatus.BLOCKED) {
                matchesFilter = false;
              } else if (currentFilters.status === 'done' && updatedTask.status !== TaskStatus.DONE) {
                matchesFilter = false;
              }
            }

            if (currentFilters?.reviewStatus && updatedTask.review_status !== currentFilters.reviewStatus) {
              matchesFilter = false;
            }

            queueUpdate((prev) => {
              const existingIndex = prev.findIndex((t) => t.id === updatedTask.id);
              
              if (existingIndex >= 0) {
                if (matchesFilter) {
                  // Merge payload directly into existing task (preserve relations)
                  const updated = [...prev];
                  updated[existingIndex] = {
                    ...updated[existingIndex],
                    ...updatedTask,
                    // Preserve relations if they exist
                    projects: updatedTask.project_id && updated[existingIndex].projects 
                      ? updated[existingIndex].projects 
                      : (updatedTask.project_id ? null : updated[existingIndex].projects),
                    assigned_user: updatedTask.assigned_to && updated[existingIndex].assigned_user
                      ? updated[existingIndex].assigned_user
                      : (updatedTask.assigned_to ? null : updated[existingIndex].assigned_user),
                  };
                  return updated;
                } else {
                  // Remove if no longer matches filter
                  return prev.filter((t) => t.id !== updatedTask.id);
                }
              } else if (matchesFilter) {
                // Add if it now matches filter - fetch relations if needed
                if (updatedTask.project_id || updatedTask.assigned_to) {
                  const promises: Promise<any>[] = [];
                  
                  if (updatedTask.project_id) {
                    promises.push(
                      Promise.resolve(
                        supabase
                          .from('projects')
                          .select('*')
                          .eq('id', updatedTask.project_id)
                          .single()
                          .then(({ data }) => data)
                      )
                    );
                  } else {
                    promises.push(Promise.resolve(null));
                  }
                  
                  if (updatedTask.assigned_to) {
                    promises.push(
                      Promise.resolve(
                        supabase
                          .from('users')
                          .select('*, roles(*)')
                          .eq('id', updatedTask.assigned_to)
                          .single()
                          .then(({ data }) => {
                            if (data) {
                              const user = data as any;
                              return {
                                ...user,
                                roles: Array.isArray(user.roles) ? user.roles[0] : user.roles,
                              };
                            }
                            return null;
                          })
                      )
                    );
                  } else {
                    promises.push(Promise.resolve(null));
                  }
                  
                  Promise.all(promises).then(([project, assignedUser]) => {
                    queueUpdate((prevTasks) => {
                      if (prevTasks.some((t) => t.id === updatedTask.id)) {
                        return prevTasks;
                      }
                      return [
                        {
                          ...updatedTask,
                          projects: project ?? null,
                          assigned_user: assignedUser ?? null,
                        } as TaskWithRelations,
                        ...prevTasks,
                      ];
                    });
                  });
                  return prev; // Return unchanged for now, will update via Promise
                } else {
                  return [
                    {
                      ...updatedTask,
                      projects: null,
                      assigned_user: null,
                    } as TaskWithRelations,
                    ...prev,
                  ];
                }
              }
              
              return prev;
            });
          } else if (payload.eventType === 'DELETE') {
            const deletedTask = payload.old as any;
            queueUpdate((prev) => prev.filter((t) => t.id !== deletedTask.id));
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
  }, [user, isConnected, filtersKey, fetchTasks, subscribe, flushUpdates]);

  return { tasks, loading, error, refetch: fetchTasks };
}
