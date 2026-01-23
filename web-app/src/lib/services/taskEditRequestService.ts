import { supabase } from '@/lib/supabase/client';
import type { TaskEditRequest, ProposedTaskChanges } from '@/lib/supabase/types';

/**
 * Task Edit Request Service
 * Handles task edit request workflow operations
 * Admins can request edits, only Super Admin can approve/reject
 */

export interface CreateEditRequestParams {
  taskId: string;
  requestedBy: string;
  proposedChanges: ProposedTaskChanges;
}

/**
 * Create an edit request for a task
 */
export async function createEditRequest(
  params: CreateEditRequestParams
): Promise<{ data: TaskEditRequest | null; error: Error | null }> {
  try {
    const { taskId, requestedBy, proposedChanges } = params;

    // Validate that at least one field is being changed
    if (!proposedChanges.title && !proposedChanges.description && 
        !proposedChanges.due_date && !proposedChanges.priority && 
        !proposedChanges.assignees) {
      return { 
        data: null, 
        error: new Error('At least one field must be changed') 
      };
    }

    // Check if there's already a pending request for this task
    const { data: existingRequests, error: checkError } = await supabase
      .from('task_edit_requests')
      .select('id, status')
      .eq('task_id', taskId)
      .eq('status', 'pending')
      .limit(1);

    if (checkError) {
      return { data: null, error: checkError as Error };
    }

    if (existingRequests && existingRequests.length > 0) {
      return { 
        data: null, 
        error: new Error('A pending edit request already exists for this task') 
      };
    }

            // Create the edit request
            const { data, error } = await (supabase
              .from('task_edit_requests') as any)
              .insert({
                task_id: taskId,
                requested_by: requestedBy,
                proposed_changes: proposedChanges as Record<string, unknown>,
                status: 'pending',
              })
              .select()
              .single();

    if (error) {
      return { data: null, error: error as Error };
    }

    return { data: data as TaskEditRequest, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

/**
 * Get edit requests for a task (or all pending requests if taskId not provided)
 */
export async function getEditRequests(
  taskId?: string
): Promise<{ data: TaskEditRequest[] | null; error: Error | null }> {
  try {
    let query = supabase
      .from('task_edit_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (taskId) {
      query = query.eq('task_id', taskId);
    }

    const { data, error } = await query;

    if (error) {
      return { data: null, error: error as Error };
    }

    return { data: data as TaskEditRequest[], error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

/**
 * Get edit request history for a task
 */
export async function getEditRequestHistory(
  taskId: string
): Promise<{ data: TaskEditRequest[] | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('task_edit_requests')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false });

    if (error) {
      return { data: null, error: error as Error };
    }

    return { data: data as TaskEditRequest[], error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

/**
 * Approve an edit request (Super Admin only)
 */
export async function approveEditRequest(
  requestId: string,
  reviewedBy: string,
  comments?: string
): Promise<{ error: Error | null }> {
  try {
    // Call the database function to apply the edit request
    const { data, error } = await (supabase.rpc as any)('apply_task_edit_request', {
      p_request_id: requestId,
      p_reviewer_id: reviewedBy,
      p_comments: comments,
    });

    if (error) {
      return { error: error as Error };
    }

    // Check if the function returned an error
    if (data && typeof data === 'object' && 'success' in data && !data.success) {
      const errorMessage = (data as { error?: string }).error ?? 'Failed to approve edit request';
      return { error: new Error(errorMessage) };
    }

      // Update comments if provided
      if (comments) {
        const { error: updateError } = await (supabase
          .from('task_edit_requests') as any)
          .update({ comments })
          .eq('id', requestId);

      if (updateError) {
        console.error('Error updating edit request comments:', updateError);
        // Don't fail the approval if comment update fails
      }
    }

    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

/**
 * Reject an edit request (Super Admin only)
 */
export async function rejectEditRequest(
  requestId: string,
  reviewedBy: string,
  comments: string
): Promise<{ error: Error | null }> {
  try {
    if (!comments || comments.trim().length === 0) {
      return { error: new Error('Comments are required when rejecting an edit request') };
    }

    // Update the edit request status
    const { error } = await (supabase
      .from('task_edit_requests') as any)
      .update({
        status: 'rejected',
        reviewed_by: reviewedBy,
        reviewed_at: new Date().toISOString(),
        comments,
      })
      .eq('id', requestId);

    if (error) {
      return { error: error as Error };
    }

    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

/**
 * Get pending edit requests (for Super Admin review page)
 */
export async function getPendingEditRequests(): Promise<{ 
  data: (TaskEditRequest & { task?: { title: string; id: string } })[];
  error: Error | null;
}> {
  try {
            const { data, error } = await (supabase
              .from('task_edit_requests') as any)
              .select(`
                *,
                task:tasks!task_edit_requests_task_id_fkey(id, title)
              `)
              .eq('status', 'pending')
              .order('created_at', { ascending: false });

    if (error) {
      return { data: [], error: error as Error };
    }

    return { 
      data: data as (TaskEditRequest & { task?: { title: string; id: string } })[], 
      error: null 
    };
  } catch (error) {
    return { data: [], error: error as Error };
  }
}

/**
 * Direct edit task (Super Admin only)
 * Allows Super Admin to edit tasks directly while maintaining audit trail
 */
export async function directEditTask(
  taskId: string,
  editedBy: string,
  changes: ProposedTaskChanges,
  comments?: string
): Promise<{ success: boolean; error: Error | null }> {
  try {
    // Validate that at least one field is being changed
    if (!changes.title && !changes.description && 
        !changes.due_date && !changes.priority && 
        !changes.assignees) {
      return { 
        success: false, 
        error: new Error('At least one field must be changed') 
      };
    }

    const { data, error } = await (supabase.rpc as any)('direct_edit_task', {
      p_task_id: taskId,
      p_edited_by: editedBy,
      p_changes: changes as Record<string, unknown>,
      p_comments: comments,
    });

    if (error) {
      return { success: false, error: error as Error };
    }

    // Check if the function returned an error
    if (data && typeof data === 'object' && 'success' in data && !data.success) {
      const errorMessage = (data as { error?: string }).error ?? 'Failed to edit task';
      return { success: false, error: new Error(errorMessage) };
    }

    return { success: true, error: null };
  } catch (error) {
    return { success: false, error: error as Error };
  }
}
