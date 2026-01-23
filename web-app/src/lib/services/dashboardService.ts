import { supabase } from '@/lib/supabase/client';
import type { Task } from '@/lib/supabase/types';

/**
 * Dashboard Service
 * Provides role-specific dashboard statistics using efficient RPC functions
 */

export interface ProjectHealth {
  project_id: string;
  project_name: string;
  project_status: string;
  total_tasks: number;
  open_tasks: number;
  work_in_progress_tasks: number;
  overdue_tasks: number;
  closed_tasks: number;
  completion_percentage: number;
}

export interface UserWorkload {
  user_id: string;
  user_name: string;
  user_email: string;
  user_role: string;
  assigned_tasks: number;
  overdue_tasks: number;
  tasks_waiting_review: number;
}

export interface TaskUrgencySummary {
  status: string;
  overdue_count: number;
  due_today_count: number;
  due_soon_count: number;
  total_count: number;
}

export interface DashboardStats {
  // Super Admin specific
  totalProjects?: number;
  totalTasks?: number;
  taskStatusDistribution?: { status: string; count: number }[];
  
  // Admin specific
  activeProjects?: number;
  recentlyUpdatedTasks?: Task[];
  
  // Staff specific
  myTasks?: number;
  tasksAwaitingAction?: number;
  tasksSubmittedForReview?: number;
  
  // Common to all roles
  tasksDueToday: number;
  overdueTasks: number;
  tasksAwaitingReview: number;
  
  // Enhanced dashboard data
  projectHealth?: ProjectHealth[];
  userWorkload?: UserWorkload[];
  taskUrgencySummary?: TaskUrgencySummary[];
  closedTasksCount?: number;
}

/**
 * Get dashboard stats for super admin
 */
export async function getSuperAdminDashboardStats(): Promise<{
  data: DashboardStats | null;
  error: Error | null;
}> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { data: null, error: new Error('Not authenticated') };
    }

    // @ts-expect-error - Supabase type inference issue with strict TypeScript
    const { data, error } = await supabase.rpc('get_dashboard_stats_super_admin', {
      p_user_id: user.id,
    });

    // If function doesn't exist, provide helpful error
    if (error) {
      const errorMessage = (error as any).message ?? '';
      if ((error as any).code === '42883' || errorMessage.includes('does not exist') || (error as any).status === 400) {
        return {
          data: null,
          error: new Error('Dashboard RPC functions not found. Please run migrations 010, 020, and 022 in Supabase SQL Editor.'),
        };
      }
      return { data: null, error: error as Error };
    }

    // Handle both TABLE return type (array) and JSON return type (object)
    let stats: {
      total_projects: number;
      total_tasks: number;
      tasks_due_today: number;
      overdue_tasks: number;
      tasks_awaiting_review: number;
      task_status_distribution?: { status: string; count: number }[];
    };

    if (Array.isArray(data) && (data as any[]).length > 0) {
      // Function returns TABLE (array of rows) - take first row
      stats = (data as any[])[0] as typeof stats;
    } else if (data && typeof data === 'object' && !Array.isArray(data)) {
      // Function returns JSON (single object)
      stats = data as typeof stats;
    } else {
      // Fallback to zeros if data is unexpected
      stats = {
        total_projects: 0,
        total_tasks: 0,
        tasks_due_today: 0,
        overdue_tasks: 0,
        tasks_awaiting_review: 0,
        task_status_distribution: [],
      };
    }

    // Fetch enhanced data in parallel for better performance
    const [
      { data: projectHealth },
      { data: userWorkload },
      { data: taskUrgency },
      { count: closedTasksCount },
    ] = await Promise.all([
      // @ts-expect-error - Supabase type inference issue with strict TypeScript
      supabase.rpc('get_project_health_summary', { p_user_id: user.id }),
      // @ts-expect-error - Supabase type inference issue with strict TypeScript
      supabase.rpc('get_user_workload_summary', { p_user_id: user.id }),
      // @ts-expect-error - Supabase type inference issue with strict TypeScript
      supabase.rpc('get_task_urgency_summary', { p_user_id: user.id }),
      supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('task_status', 'Closed'),
    ]);

    return {
      data: {
        totalProjects: stats.total_projects,
        totalTasks: stats.total_tasks,
        tasksDueToday: stats.tasks_due_today,
        overdueTasks: stats.overdue_tasks,
        tasksAwaitingReview: stats.tasks_awaiting_review,
        taskStatusDistribution: stats.task_status_distribution ?? [],
        projectHealth: (projectHealth as ProjectHealth[] | null) ?? [],
        userWorkload: (userWorkload as UserWorkload[] | null) ?? [],
        taskUrgencySummary: (taskUrgency as TaskUrgencySummary[] | null) ?? [],
        closedTasksCount: closedTasksCount ?? 0,
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

/**
 * Get dashboard stats for admin
 */
export async function getAdminDashboardStats(): Promise<{
  data: DashboardStats | null;
  error: Error | null;
}> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { data: null, error: new Error('Not authenticated') };
    }

    // @ts-expect-error - Supabase type inference issue with strict TypeScript
    const { data, error } = await supabase.rpc('get_dashboard_stats_admin', {
      p_user_id: user.id,
    });

    // If function doesn't exist, provide helpful error
    if (error) {
      const errorMessage = (error as any).message ?? '';
      if ((error as any).code === '42883' || errorMessage.includes('does not exist') || (error as any).status === 400) {
        return {
          data: null,
          error: new Error('Dashboard RPC functions not found. Please run migrations 010, 020, and 022 in Supabase SQL Editor.'),
        };
      }
      return { data: null, error: error as Error };
    }

    // Handle both TABLE return type (array) and JSON return type (object)
    let stats: {
      active_projects: number;
      tasks_due_today: number;
      overdue_tasks: number;
      tasks_awaiting_review: number;
      recently_updated_tasks?: Array<{
        id: string;
        title: string;
        status: string;
        updated_at: string;
      }>;
    };

    if (Array.isArray(data) && (data as any[]).length > 0) {
      // Function returns TABLE (array of rows) - take first row
      stats = (data as any[])[0] as typeof stats;
    } else if (data && typeof data === 'object' && !Array.isArray(data)) {
      // Function returns JSON (single object)
      stats = data as typeof stats;
    } else {
      // Fallback to zeros if data is unexpected
      stats = {
        active_projects: 0,
        tasks_due_today: 0,
        overdue_tasks: 0,
        tasks_awaiting_review: 0,
        recently_updated_tasks: [],
      };
    }

    // Fetch full task details for recently updated tasks
    const taskIds = (stats.recently_updated_tasks ?? []).map((t) => t.id);
    let recentlyUpdatedTasks: Task[] = [];

    if (taskIds.length > 0) {
      const { data: tasksData, error: tasksError } = await supabase
        .from('tasks')
        .select('*')
        .in('id', taskIds);

      if (!tasksError && tasksData && stats.recently_updated_tasks) {
        // Preserve order from RPC result
        const taskMap = new Map((tasksData as any).map((t: any) => [t.id, t]));
        recentlyUpdatedTasks = stats.recently_updated_tasks
          .map((t) => taskMap.get(t.id))
          .filter((t): t is Task => t !== undefined);
      }
    }

    // Fetch enhanced data in parallel for better performance
    const [
      { data: projectHealth },
      { data: userWorkload },
      { data: taskUrgency },
      { count: closedTasksCount },
    ] = await Promise.all([
      // @ts-expect-error - Supabase type inference issue with strict TypeScript
      supabase.rpc('get_project_health_summary', { p_user_id: user.id }),
      // @ts-expect-error - Supabase type inference issue with strict TypeScript
      supabase.rpc('get_user_workload_summary', { p_user_id: user.id }),
      // @ts-expect-error - Supabase type inference issue with strict TypeScript
      supabase.rpc('get_task_urgency_summary', { p_user_id: user.id }),
      supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('task_status', 'Closed'),
    ]);

    return {
      data: {
        activeProjects: stats.active_projects,
        tasksDueToday: stats.tasks_due_today,
        overdueTasks: stats.overdue_tasks,
        tasksAwaitingReview: stats.tasks_awaiting_review,
        recentlyUpdatedTasks: (stats.recently_updated_tasks && stats.recently_updated_tasks.length > 0) ? recentlyUpdatedTasks : [],
        projectHealth: (projectHealth as ProjectHealth[] | null) ?? [],
        userWorkload: (userWorkload as UserWorkload[] | null) ?? [],
        taskUrgencySummary: (taskUrgency as TaskUrgencySummary[] | null) ?? [],
        closedTasksCount: closedTasksCount ?? 0,
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

/**
 * Get dashboard stats for staff
 */
export async function getStaffDashboardStats(): Promise<{
  data: DashboardStats | null;
  error: Error | null;
}> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { data: null, error: new Error('Not authenticated') };
    }

    // Try RPC function first
    // @ts-expect-error - Supabase type inference issue with strict TypeScript
    const { data, error } = await (supabase.rpc('get_dashboard_stats_staff', {
      p_user_id: user.id,
    }) as any);

    // If function doesn't exist (migrations not run) or user doesn't exist in users table, fall back to direct queries
    if (error) {
      const errorMessage = (error as any).message ?? '';
      const errorCode = (error as any).code ?? '';
      
      // Check for various error conditions that indicate we should use fallback
      if (
        errorCode === '42883' || // Function does not exist
        errorMessage.includes('does not exist') ||
        errorMessage.includes('User does not exist') ||
        errorCode === 'P0001' || // PostgreSQL exception (like our RAISE EXCEPTION)
        (error as any).status === 400 // Bad request (function might not exist)
      ) {
        console.warn('RPC function not available, using fallback queries:', errorMessage);
        return await getStaffDashboardStatsFallback(user.id);
      }
      
      return { data: null, error: error as Error };
    }

    // Handle both TABLE return type (array) and JSON return type (object)
    let stats: {
      my_tasks: number;
      tasks_due_today: number;
      overdue_tasks: number;
      tasks_awaiting_action: number;
      tasks_submitted_for_review: number;
    };

    if (Array.isArray(data) && data.length > 0) {
      // Function returns TABLE (array of rows) - take first row
      stats = data[0] as typeof stats;
    } else if (data && typeof data === 'object' && !Array.isArray(data)) {
      // Function returns JSON (single object)
      stats = data as typeof stats;
    } else {
      // Fallback to zeros if data is unexpected
      stats = {
        my_tasks: 0,
        tasks_due_today: 0,
        overdue_tasks: 0,
        tasks_awaiting_action: 0,
        tasks_submitted_for_review: 0,
      };
    }

    // Fetch enhanced data in parallel for better performance
    const [
      { data: projectHealth },
      { data: taskUrgency },
      { count: closedTasksCount },
      { count: tasksAwaitingReviewCount },
    ] = await Promise.all([
      // @ts-expect-error - Supabase type inference issue with strict TypeScript
      supabase.rpc('get_project_health_summary', { p_user_id: user.id }),
      // @ts-expect-error - Supabase type inference issue with strict TypeScript
      supabase.rpc('get_task_urgency_summary', { p_user_id: user.id }),
      supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('assigned_to', user.id)
        .not('archived_at', 'is', null), // Count archived tasks as closed
      supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('assigned_to', user.id)
        .eq('task_status', 'Done'),
    ]);

    return {
      data: {
        myTasks: stats.my_tasks,
        tasksDueToday: stats.tasks_due_today,
        overdueTasks: stats.overdue_tasks,
        tasksAwaitingAction: stats.tasks_awaiting_action,
        tasksSubmittedForReview: stats.tasks_submitted_for_review,
        tasksAwaitingReview: tasksAwaitingReviewCount ?? 0, // Tasks assigned to staff that are pending review
        projectHealth: ((projectHealth as unknown) as ProjectHealth[] | null) ?? [],
        taskUrgencySummary: ((taskUrgency as unknown) as TaskUrgencySummary[] | null) ?? [],
        closedTasksCount: closedTasksCount ?? 0,
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

/**
 * Fallback function for staff dashboard stats using direct queries
 * Used when RPC functions don't exist (migrations not run)
 */
async function getStaffDashboardStatsFallback(userId: string): Promise<{
  data: DashboardStats | null;
  error: Error | null;
}> {
  try {
    // My tasks (assigned to me)
    const { count: myTasks } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('assigned_to', userId);

    // Tasks due today
    const today = new Date().toISOString().split('T')[0];
    const { count: tasksDueToday } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('assigned_to', userId)
      .not('due_date', 'is', null)
      .neq('status', 'done')
      .gte('due_date', `${today}T00:00:00`)
      .lte('due_date', `${today}T23:59:59`);

    // Overdue tasks
    const now = new Date().toISOString();
    const { count: overdueTasks } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('assigned_to', userId)
      .not('due_date', 'is', null)
      .neq('status', 'done')
      .lt('due_date', now);

    // Tasks awaiting action
    const { count: tasksAwaitingAction } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('assigned_to', userId)
      .not('status', 'in', '(done,blocked)');

    // Tasks submitted for review (if review_status column exists)
    let tasksSubmittedForReview = 0;
    try {
      const { count } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('review_requested_by', userId)
        .in('review_status', ['pending_review', 'under_review']);
      tasksSubmittedForReview = count ?? 0;
    } catch {
      // Column might not exist if migrations not run
      tasksSubmittedForReview = 0;
    }

    return {
      data: {
        myTasks: myTasks ?? 0,
        tasksDueToday: tasksDueToday ?? 0,
        overdueTasks: overdueTasks ?? 0,
        tasksAwaitingAction: tasksAwaitingAction ?? 0,
        tasksSubmittedForReview,
        tasksAwaitingReview: 0,
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}
