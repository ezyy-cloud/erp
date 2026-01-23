import { supabase } from '@/lib/supabase/client';
import type { Task } from '@/lib/supabase/types';

/**
 * Task Deletion Service
 * Handles soft deletion and restoration of tasks
 * Only Super Admin can perform these operations
 */

/**
 * Soft delete a task
 */
export async function softDeleteTask(
  taskId: string,
  deletedBy: string
): Promise<{ success: boolean; error: Error | null }> {
  try {
    // Call the database function
    const { data, error } = await (supabase.rpc as any)('soft_delete_task', {
      task_id: taskId,
      deleted_by: deletedBy,
    });

    if (error) {
      return { success: false, error: error as Error };
    }

    // Check if the function returned an error
    if (data && typeof data === 'object' && 'success' in data && !data.success) {
      const errorMessage = (data as { error?: string }).error ?? 'Failed to delete task';
      return { success: false, error: new Error(errorMessage) };
    }

    return { success: true, error: null };
  } catch (error) {
    return { success: false, error: error as Error };
  }
}

/**
 * Restore a soft-deleted task
 */
export async function restoreTask(
  taskId: string,
  restoredBy: string
): Promise<{ error: Error | null }> {
  try {
    // Call the database function
    const { data, error } = await (supabase.rpc as any)('restore_task', {
      task_id: taskId,
      restored_by: restoredBy,
    });

    if (error) {
      return { error: error as Error };
    }

    // Check if the function returned an error
    if (data && typeof data === 'object' && 'success' in data && !data.success) {
      const errorMessage = (data as { error?: string }).error ?? 'Failed to restore task';
      return { error: new Error(errorMessage) };
    }

    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

/**
 * Get all soft-deleted tasks (Super Admin only)
 */
export async function getDeletedTasks(): Promise<{ 
  data: Task[] | null; 
  error: Error | null;
}> {
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });

    if (error) {
      return { data: null, error: error as Error };
    }

    return { data: data as Task[], error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

/**
 * Hard delete a task (permanent deletion)
 * WARNING: This is a destructive operation and should only be used after careful consideration
 * This function may not be implemented in the database - it's here for future use
 */
export async function hardDeleteTask(
  taskId: string
): Promise<{ error: Error | null }> {
  try {
    // First verify the task is soft-deleted
    const { data: task, error: fetchError } = await (supabase
      .from('tasks') as any)
      .select('deleted_at')
      .eq('id', taskId)
      .single();

    if (fetchError) {
      return { error: fetchError as Error };
    }

    if (!task || !(task as any).deleted_at) {
      return { error: new Error('Task must be soft-deleted before hard deletion') };
    }

    // Hard delete (this will cascade to related records)
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', taskId);

    if (error) {
      return { error: error as Error };
    }

    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}
