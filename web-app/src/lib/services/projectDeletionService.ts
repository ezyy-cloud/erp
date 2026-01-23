import { supabase } from '@/lib/supabase/client';

/**
 * Project Deletion Service
 * Hard deletes projects (cascade removes tasks and members).
 * Only Super Admins should be allowed by RLS.
 */
export async function deleteProject(
  projectId: string
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId);

    if (error) {
      return { error: error as Error };
    }

    return { error: null };
  } catch (err) {
    return { error: err as Error };
  }
}
