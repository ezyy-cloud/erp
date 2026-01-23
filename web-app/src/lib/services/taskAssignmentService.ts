import { supabase } from '@/lib/supabase/client';
import type { TaskAssignee, UserWithRole } from '@/lib/supabase/types';

/**
 * Task Assignment Service
 * Handles multi-user task assignment operations
 */

/**
 * Assign multiple users to a task
 */
export async function assignTask(
  taskId: string,
  userIds: string[],
  assignedBy: string
): Promise<{ error: Error | null }> {
  try {
    if (!userIds || userIds.length === 0) {
      return { error: new Error('At least one user must be assigned') };
    }

    // Remove duplicates
    const uniqueUserIds = [...new Set(userIds)];

    // Prepare assignments
    const assignments = uniqueUserIds.map(userId => ({
      task_id: taskId,
      user_id: userId,
      assigned_by: assignedBy,
    }));

    // Insert assignments (ON CONFLICT will handle duplicates)
    const { error } = await (supabase
      .from('task_assignees') as any)
      .upsert(assignments, {
        onConflict: 'task_id,user_id',
        ignoreDuplicates: true,
      });

    if (error) {
      return { error: error as Error };
    }

    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

/**
 * Unassign a user from a task (Super Admin only)
 */
export async function unassignTask(
  taskId: string,
  userId: string
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase
      .from('task_assignees')
      .delete()
      .eq('task_id', taskId)
      .eq('user_id', userId);

    if (error) {
      return { error: error as Error };
    }

    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

/**
 * Replace all assignees for a task
 */
export async function replaceTaskAssignees(
  taskId: string,
  userIds: string[],
  assignedBy: string
): Promise<{ error: Error | null }> {
  try {
    // First, remove all existing assignments
    const { error: deleteError } = await supabase
      .from('task_assignees')
      .delete()
      .eq('task_id', taskId);

    if (deleteError) {
      return { error: deleteError as Error };
    }

    // Then assign new users (if any)
    if (userIds.length > 0) {
      return await assignTask(taskId, userIds, assignedBy);
    }

    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

/**
 * Get all assignees for a task
 */
export async function getTaskAssignees(
  taskId: string
): Promise<{ data: (TaskAssignee & { user?: UserWithRole })[] | null; error: Error | null }> {
  try {
    // First fetch task_assignees
    const { data: assigneesData, error: assigneesError } = await supabase
      .from('task_assignees')
      .select('*')
      .eq('task_id', taskId)
      .order('assigned_at', { ascending: true });

    if (assigneesError) {
      return { data: null, error: assigneesError as Error };
    }

    if (!assigneesData || assigneesData.length === 0) {
      return { data: [], error: null };
    }

    // Extract user IDs and fetch users separately to avoid relationship ambiguity
    const assigneesArray = assigneesData as any[];
    const userIds = [...new Set(assigneesArray.map((a: any) => a.user_id).filter(Boolean))];
    
    if (userIds.length === 0) {
      return { data: assigneesArray.map((a: any) => ({ ...a, user: undefined })), error: null };
    }

    // Fetch users with roles using explicit foreign key
    const { data: usersData, error: usersError } = await supabase
      .from('users')
      .select('*, roles:roles!users_role_id_fkey(*)')
      .in('id', userIds);

    if (usersError) {
      return { data: null, error: usersError as Error };
    }

    // Create a map of users by ID
    const usersMap = new Map(
      (usersData ?? []).map((u: any) => {
        const user = {
          ...u,
          roles: Array.isArray(u.roles) && u.roles.length > 0 ? u.roles[0] : (u.roles ?? null),
        } as UserWithRole;
        return [u.id, user];
      })
    );

    // Combine assignees with user data
    const transformed = (assigneesData as any[]).map((assignee: any) => ({
      ...assignee,
      user: usersMap.get(assignee.user_id),
    }));

    return { data: transformed as (TaskAssignee & { user?: UserWithRole })[], error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

/**
 * Check if a user is assigned to a task
 */
export async function isUserAssigned(
  taskId: string,
  userId: string
): Promise<{ isAssigned: boolean; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('task_assignees')
      .select('id')
      .eq('task_id', taskId)
      .eq('user_id', userId)
      .limit(1)
      .single();

    if (error) {
      // If no rows found, user is not assigned
      if (error.code === 'PGRST116') {
        return { isAssigned: false, error: null };
      }
      return { isAssigned: false, error: error as Error };
    }

    return { isAssigned: data !== null, error: null };
  } catch (error) {
    return { isAssigned: false, error: error as Error };
  }
}

/**
 * Get all tasks assigned to a user
 */
export async function getTasksAssignedToUser(
  userId: string
): Promise<{ data: string[] | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('task_assignees')
      .select('task_id')
      .eq('user_id', userId);

    if (error) {
      return { data: null, error: error as Error };
    }

    const taskIds = (data ?? []).map((item: { task_id: string }) => item.task_id);
    return { data: taskIds, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}
