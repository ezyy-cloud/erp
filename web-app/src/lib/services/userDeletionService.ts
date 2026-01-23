import { supabase } from '@/lib/supabase/client';
import type { UserWithRole } from '@/lib/supabase/types';

/**
 * User Deletion Service
 * Handles soft deletion and restoration of users
 * Only Super Admin can perform these operations
 */

export interface SoftDeleteUserParams {
  userId: string;
  deletedBy: string;
  reassignTasksTo?: string | null; // Optional: reassign user's tasks to another user
}

export interface SoftDeleteUserResult {
  tasksReassigned?: number;
  tasksOrphaned?: number;
}

/**
 * Soft delete a user
 */
export async function softDeleteUser(
  params: SoftDeleteUserParams
): Promise<{ result: SoftDeleteUserResult | null; error: Error | null }> {
  try {
    const { userId, deletedBy, reassignTasksTo } = params;

    // Call the database function
    const { data, error } = await (supabase.rpc as any)('soft_delete_user', {
      user_id: userId,
      deleted_by: deletedBy,
      reassign_tasks_to: reassignTasksTo ?? null,
    });

    if (error) {
      return { result: null, error: error as Error };
    }

    // Check if the function returned an error
    if (data && typeof data === 'object' && 'success' in data && !data.success) {
      const errorMessage = (data as { error?: string }).error ?? 'Failed to delete user';
      return { result: null, error: new Error(errorMessage) };
    }

    // Extract result data
    const result: SoftDeleteUserResult = {
      tasksReassigned: (data as { tasks_reassigned?: number })?.tasks_reassigned ?? 0,
      tasksOrphaned: (data as { tasks_orphaned?: number })?.tasks_orphaned ?? 0,
    };

    return { result, error: null };
  } catch (error) {
    return { result: null, error: error as Error };
  }
}

/**
 * Restore a soft-deleted user
 */
export async function restoreUser(
  userId: string,
  restoredBy: string
): Promise<{ error: Error | null }> {
  try {
    // Call the database function
    const { data, error } = await (supabase.rpc as any)('restore_user', {
      user_id: userId,
      restored_by: restoredBy,
    });

    if (error) {
      return { error: error as Error };
    }

    // Check if the function returned an error
    if (data && typeof data === 'object' && 'success' in data && !data.success) {
      const errorMessage = (data as { error?: string }).error ?? 'Failed to restore user';
      return { error: new Error(errorMessage) };
    }

    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

/**
 * Get all soft-deleted users (Super Admin only)
 */
export async function getDeletedUsers(): Promise<{ 
  data: UserWithRole[] | null; 
  error: Error | null;
}> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select(`
        *,
        roles(*)
      `)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });

    if (error) {
      return { data: null, error: error as Error };
    }

    // Transform the data to match expected format
    const transformed = (data ?? []).map((user: any) => ({
      ...user,
      roles: Array.isArray(user.roles) ? user.roles[0] : user.roles,
    }));

    return { data: transformed as UserWithRole[], error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

/**
 * Get tasks assigned to a user (for reassignment purposes)
 */
export async function getUserTasks(
  userId: string
): Promise<{ data: { taskId: string; title: string }[] | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('task_assignees')
      .select(`
        task_id,
        task:tasks!task_assignees_task_id_fkey(id, title)
      `)
      .eq('user_id', userId);

    if (error) {
      return { data: null, error: error as Error };
    }

    const tasks = (data ?? [])
      .map((item: any) => ({
        taskId: item.task_id,
        title: item.task?.title ?? 'Unknown Task',
      }))
      .filter((item: { taskId: string; title: string }) => item.taskId);

    return { data: tasks, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}
