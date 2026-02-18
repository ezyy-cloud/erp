import { supabase } from '@/lib/supabase/client';
import { TaskStatus } from '@/lib/supabase/types';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Task Progress Service
 * Handles append-only progress logging for tasks and explicit status transitions
 */

export interface TaskProgressLog {
  id: string;
  task_id: string;
  user_id: string;
  status: string;
  progress_note: string | null;
  created_at: string;
  created_by: string | null;
}

/**
 * Explicit transition: Start Work (ToDo → Work-In-Progress)
 * This is an explicit user action - no automatic triggers
 */
export async function startWorkOnTask(
  taskId: string,
  userId: string,
  progressNote?: string
): Promise<{ success: boolean; error: Error | null; message?: string }> {
  try {
    // Use `as any` because this RPC is defined in SQL and not present in generated TS types
    const { data, error } = await ((supabase as any).rpc('transition_to_work_in_progress', {
      p_task_id: taskId,
      p_user_id: userId,
    }) as any);

    if (error) {
      return { success: false, error: error as Error };
    }

    // If a custom progress note is provided, add it to the progress log
    if (progressNote && (data as any)?.success) {
      await ((supabase.from('task_progress_log') as any).insert({
        task_id: taskId,
        user_id: userId,
        status: 'Work-In-Progress',
        progress_note: progressNote,
        created_by: userId,
      }) as any);
    }

    return {
      success: (data as any)?.success ?? true,
      error: null,
      message: (data as any)?.message ?? 'Task moved to Work-In-Progress',
    };
  } catch (error) {
    return { success: false, error: error as Error };
  }
}

/**
 * Add a progress log entry (append-only)
 */
export async function addProgressLog(
  taskId: string,
  userId: string,
  status: TaskStatus,
  progressNote?: string
): Promise<{ error: Error | null }> {
  try {
    // First, update the task status
    const { error: statusError } = await ((supabase
      .from('tasks') as any)
      .update({ status })
      .eq('id', taskId) as any);

    if (statusError) {
      return { error: statusError as Error };
    }

    // Then, create a progress log entry
    const { error: logError } = await ((supabase
      .from('task_progress_log') as any)
      .insert({
        task_id: taskId,
        user_id: userId,
        status,
        progress_note: progressNote ?? null,
        created_by: userId,
      }) as any);

    if (logError) {
      return { error: logError as Error };
    }

    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

/**
 * Get progress log entries for a task
 */
export async function getProgressLogs(
  taskId: string
): Promise<{ data: TaskProgressLog[] | null; error: Error | null }> {
  try {
    const { data, error } = await ((supabase
      .from('task_progress_log') as any)
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true }) as any);

    if (error) {
      return { data: null, error: error as Error };
    }

    return { data: data as TaskProgressLog[], error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

/**
 * Subscribe to real-time progress log updates for a task
 * Returns unsubscribe function
 */
export function subscribeToProgressLogs(
  taskId: string,
  callback: (log: TaskProgressLog) => void
): () => void {
  const channel: RealtimeChannel = supabase
    .channel(`task_progress_log:${taskId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'task_progress_log',
        filter: `task_id=eq.${taskId}`,
      },
      (payload) => {
        callback(payload.new as TaskProgressLog);
      }
    )
    .subscribe();

  // Return unsubscribe function
  return () => {
    supabase.removeChannel(channel);
  };
}
