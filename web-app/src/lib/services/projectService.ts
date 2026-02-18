import { supabase } from '@/lib/supabase/client';
import type { ProjectStatus } from '@/lib/supabase/types';

/** Notify project members of a project change (in-app + email via webhook). Fire-and-forget. */
async function notifyProjectChange(
  projectId: string,
  changeType: 'project_updated' | 'project_closed' | 'project_reopened'
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const changedBy = user?.id ?? null;
    await supabase.rpc('create_project_change_notification', {
      p_project_id: projectId,
      p_change_type: changeType,
      p_changed_by: changedBy,
    } as never);
  } catch {
    // Non-blocking; do not fail the main operation
  }
}

export interface UpdateProjectParams {
  projectId: string;
  name?: string;
  description?: string;
  status?: ProjectStatus;
}

export interface CloseProjectResult {
  success: boolean;
  projectId: string;
  closedTasksCount: number;
  error?: string;
}

export interface ReopenProjectResult {
  success: boolean;
  projectId: string;
  reactivatedTasksCount: number;
  error?: string;
}

/**
 * Update project details
 * Only Admin and Super Admin can edit projects
 */
export async function updateProject(params: UpdateProjectParams): Promise<{ error: Error | null }> {
  const { projectId, name, description, status } = params;

  try {
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) {
      updateData.name = name;
    }

    if (description !== undefined) {
      updateData.description = description;
    }

    if (status !== undefined) {
      updateData.status = status;
    }

    // If closing project, use RPC function to cascade closure
    if (status === 'closed') {
      // @ts-expect-error - Supabase type inference issue with strict TypeScript
      const { data, error } = await supabase.rpc('close_project_with_cascade', {
        p_project_id: projectId,
      });

      if (error) {
        return { error: error as Error };
      }

      const result = data as any;
      if (result && !result.success) {
        return { error: new Error(result.error ?? 'Failed to close project') };
      }

      await notifyProjectChange(projectId, 'project_closed');
      return { error: null };
    }

    // If reopening project, use RPC function to reactivate tasks
    if (status === 'active') {
      // Check if project was previously closed
      const { data: projectData } = await supabase
        .from('projects')
        .select('status')
        .eq('id', projectId)
        .single();

      if (projectData && (projectData as any).status === 'closed') {
        // @ts-expect-error - Supabase type inference issue with strict TypeScript
        const { data, error } = await supabase.rpc('reopen_project_with_reactivate', {
          p_project_id: projectId,
        });

        if (error) {
          return { error: error as Error };
        }

        const result = data as any;
        if (result && !result.success) {
          return { error: new Error(result.error ?? 'Failed to reopen project') };
        }

        // Update other fields if provided
        if (name !== undefined || description !== undefined) {
          const { error: updateError } = await ((supabase
            .from('projects') as any)
            .update(updateData)
            .eq('id', projectId) as any);

          if (updateError) {
            return { error: updateError as Error };
          }
        }

        await notifyProjectChange(projectId, 'project_reopened');
        return { error: null };
      }
    }

    // Regular update for other status changes or field updates
    const { error } = await ((supabase
      .from('projects') as any)
      .update(updateData)
      .eq('id', projectId) as any);

    if (error) {
      return { error: error as Error };
    }

    await notifyProjectChange(projectId, 'project_updated');
    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

/**
 * Close a project and cascade closure to all linked tasks
 * Only Admin and Super Admin can close projects
 */
export async function closeProject(projectId: string): Promise<CloseProjectResult> {
  try {
    // @ts-expect-error - Supabase type inference issue with strict TypeScript
    const { data, error } = await supabase.rpc('close_project_with_cascade', {
      p_project_id: projectId,
    });

    if (error) {
      return {
        success: false,
        projectId,
        closedTasksCount: 0,
        error: error.message,
      };
    }

    const result = data as any;
    if (result && !result.success) {
      return {
        success: false,
        projectId,
        closedTasksCount: 0,
        error: result.error ?? 'Failed to close project',
      };
    }

    await notifyProjectChange(projectId, 'project_closed');
    return {
      success: true,
      projectId: result?.project_id ?? projectId,
      closedTasksCount: result?.closed_tasks_count ?? 0,
    };
  } catch (error) {
    return {
      success: false,
      projectId,
      closedTasksCount: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Reopen a project and reactivate tasks that were closed due to project closure
 * Only Admin and Super Admin can reopen projects
 */
export async function reopenProject(projectId: string): Promise<ReopenProjectResult> {
  try {
    // @ts-expect-error - Supabase type inference issue with strict TypeScript
    const { data, error } = await supabase.rpc('reopen_project_with_reactivate', {
      p_project_id: projectId,
    });

    if (error) {
      return {
        success: false,
        projectId,
        reactivatedTasksCount: 0,
        error: error.message,
      };
    }

    const result = data as any;
    if (result && !result.success) {
      return {
        success: false,
        projectId,
        reactivatedTasksCount: 0,
        error: result.error ?? 'Failed to reopen project',
      };
    }

    await notifyProjectChange(projectId, 'project_reopened');
    return {
      success: true,
      projectId: result?.project_id ?? projectId,
      reactivatedTasksCount: result?.reactivated_tasks_count ?? 0,
    };
  } catch (error) {
    return {
      success: false,
      projectId,
      reactivatedTasksCount: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check if a task is closed
 */
export function isTaskClosed(task: { status: string }): boolean {
  return task.status === 'closed';
}
