import { supabase } from '@/lib/supabase/client';

/**
 * Task Archive Service
 * Handles task archive and unarchive operations
 */

/**
 * Mark task as done and request review
 * Called when an ordinary user marks a task as done
 */
export async function markTaskDonePendingReview(
  taskId: string,
  userId: string
): Promise<{ error: Error | null }> {
  try {
    // @ts-expect-error - Supabase type inference issue with strict TypeScript
    const { data, error } = await supabase.rpc('mark_task_done_pending_review', {
      p_task_id: taskId,
      p_user_id: userId,
    }) as { data: { success: boolean; error?: string } | null; error: Error | null };

    if (error) {
      return { error: error as Error };
    }

    if (data && !data.success) {
      return { error: new Error(data.error ?? 'Failed to mark task as done') };
    }

    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

/**
 * Archive a task (Super Admin only)
 * Archives a task and marks it as closed
 */
export async function archiveTask(
  taskId: string,
  userId: string
): Promise<{ error: Error | null }> {
  try {
    // @ts-expect-error - Supabase type inference issue with strict TypeScript
    const { data, error } = await supabase.rpc('archive_task', {
      p_task_id: taskId,
      p_user_id: userId,
    }) as { data: { success: boolean; error?: string } | null; error: Error | null };

    if (error) {
      return { error: error as Error };
    }

    if (data && !data.success) {
      return { error: new Error(data.error ?? 'Failed to archive task') };
    }

    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

/**
 * Unarchive a task (Super Admin only)
 * Reopens a Closed task, transitioning it to Work-In-Progress
 */
export async function unarchiveTask(
  taskId: string,
  userId: string
): Promise<{ error: Error | null }> {
  try {
    // @ts-expect-error - Supabase type inference issue with strict TypeScript
    const { data, error } = await supabase.rpc('unarchive_task', {
      p_task_id: taskId,
      p_user_id: userId,
    }) as { data: { success: boolean; error?: string } | null; error: Error | null };

    if (error) {
      return { error: error as Error };
    }

    if (data && !data.success) {
      return { error: new Error(data.error ?? 'Failed to reopen task') };
    }

    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

/**
 * Approve review and archive task in one operation (Super Admin only)
 */
export async function approveAndArchiveTask(
  taskId: string,
  userId: string,
  comments?: string
): Promise<{ error: Error | null }> {
  try {
    // @ts-expect-error - Supabase type inference issue with strict TypeScript
    const { data, error } = await supabase.rpc('approve_and_archive_task', {
      p_task_id: taskId,
      p_user_id: userId,
      p_comments: comments ?? null,
    }) as { data: { success: boolean; error?: string } | null; error: Error | null };

    if (error) {
      return { error: error as Error };
    }

    if (data && !data.success) {
      return { error: new Error(data.error ?? 'Failed to approve and archive task') };
    }

    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

/**
 * Reject review and return task to active status (Super Admin only)
 */
export async function rejectReviewAndReopen(
  taskId: string,
  userId: string,
  comments: string
): Promise<{ error: Error | null }> {
  try {
    if (!comments || comments.trim().length === 0) {
      return { error: new Error('Comments are required when rejecting review') };
    }

    // @ts-expect-error - Supabase type inference issue with strict TypeScript
    const { data, error } = await supabase.rpc('reject_review_and_reopen', {
      p_task_id: taskId,
      p_user_id: userId,
      p_comments: comments,
    }) as { data: { success: boolean; error?: string } | null; error: Error | null };

    if (error) {
      return { error: error as Error };
    }

    if (data && !data.success) {
      return { error: new Error(data.error ?? 'Failed to reject review') };
    }

    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}
