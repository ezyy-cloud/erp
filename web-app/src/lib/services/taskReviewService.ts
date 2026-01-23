import { supabase } from '@/lib/supabase/client';
import { TaskReviewStatus } from '@/lib/supabase/types';
import { approveAndArchiveTask, rejectReviewAndReopen } from './taskArchiveService';

/**
 * Task Review Service
 * Handles task review workflow operations
 */

/**
 * Request review for a task
 * Note: When a user marks a task as done, use markTaskDonePendingReview from taskArchiveService
 * This function is kept for backward compatibility
 */
export async function requestReview(
  taskId: string,
  userId: string
): Promise<{ error: Error | null }> {
  try {
    // Update task review status
    const { error: updateError } = await ((supabase
      .from('tasks') as any)
      .update({
        review_status: TaskReviewStatus.PENDING_REVIEW,
        review_requested_by: userId,
        review_requested_at: new Date().toISOString(),
      })
      .eq('id', taskId) as any);

    if (updateError) {
      return { error: updateError as Error };
    }

    // Trigger notification via database function
    // @ts-expect-error - Supabase type inference issue with strict TypeScript
    const { error: notifyError } = await supabase.rpc('create_review_requested_notification', {
      p_task_id: taskId,
      p_requested_by: userId,
    });

    if (notifyError) {
      console.error('Error creating review notification:', notifyError);
      // Don't fail the request if notification fails
    }

    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

/**
 * Approve a task and archive it
 * This is the new workflow: approval automatically archives the task
 */
export async function approveTask(
  taskId: string,
  userId: string,
  comments?: string
): Promise<{ error: Error | null }> {
  // Use the new approve and archive function
  return approveAndArchiveTask(taskId, userId, comments);
}

/**
 * Request changes for a task (reject review and return to active)
 * This is the new workflow: rejection returns task to active status
 */
export async function requestChanges(
  taskId: string,
  userId: string,
  comments: string
): Promise<{ error: Error | null }> {
  // Use the new reject and reopen function
  return rejectReviewAndReopen(taskId, userId, comments);
}

/**
 * Reset review status (e.g., when task is updated after changes requested)
 */
export async function resetReviewStatus(taskId: string): Promise<{ error: Error | null }> {
  try {
    const { error } = await ((supabase
      .from('tasks') as any)
      .update({
        review_status: TaskReviewStatus.NONE,
        review_requested_by: null,
        reviewed_by: null,
        reviewed_at: null,
        review_comments: null,
      })
      .eq('id', taskId) as any);

    if (error) {
      return { error: error as Error };
    }

    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}
