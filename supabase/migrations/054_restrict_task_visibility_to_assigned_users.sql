-- Migration 054: Restrict Task Visibility to Assigned Users
-- Reverts the "transparency model" from migration 046 back to assignment-based visibility.
-- Regular users can only see tasks assigned to them (via task_assignees or legacy assigned_to)
-- or tasks in projects they are members of.
-- Admins and super admins retain full visibility of all active tasks.

-- ============================================
-- 1. Revert Task SELECT Policies
-- ============================================

-- Drop the permissive "all users see all tasks" policy added by migration 046
DROP POLICY IF EXISTS "All authenticated users can view all active tasks" ON tasks;

-- Recreate assignment-based SELECT policies (matching migration 033 pattern)

CREATE POLICY "Users can view assigned tasks" ON tasks
  FOR SELECT USING (
    deleted_at IS NULL
    AND archived_at IS NULL
    AND (
      public.user_is_task_assignee(tasks.id, auth.uid())
      OR assigned_to = auth.uid()
    )
  );

CREATE POLICY "Users can view tasks in their projects" ON tasks
  FOR SELECT USING (
    deleted_at IS NULL
    AND archived_at IS NULL
    AND project_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = tasks.project_id
      AND pm.user_id = auth.uid()
    )
  );

-- Existing policies that remain unchanged:
--   "Super admins and admins can view all active tasks" (from 033)
--   "Super admins can view archived tasks" (from 033)
--   "Super Admin can view deleted tasks" (from 028)

-- ============================================
-- 2. Revert Task Comments SELECT Policy
-- ============================================

DROP POLICY IF EXISTS "All users can view comments for all tasks" ON task_comments;

CREATE POLICY "Users can view comments for accessible tasks" ON task_comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_comments.task_id
      AND t.deleted_at IS NULL
      AND (
        EXISTS (
          SELECT 1 FROM task_assignees ta
          WHERE ta.task_id = t.id
          AND ta.user_id = auth.uid()
        )
        OR t.assigned_to = auth.uid()
        OR public.user_has_role(ARRAY['super_admin', 'admin'])
        OR (
          t.project_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM project_members pm
            WHERE pm.project_id = t.project_id
            AND pm.user_id = auth.uid()
          )
        )
      )
    )
  );

-- INSERT policy "Only assigned users can create comments" (from 046) remains unchanged

-- ============================================
-- 3. Revert Task Notes SELECT Policy
-- ============================================

DROP POLICY IF EXISTS "All users can view notes for all tasks" ON task_notes;

CREATE POLICY "Users can view notes for accessible tasks" ON task_notes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_notes.task_id
      AND t.deleted_at IS NULL
      AND (
        EXISTS (
          SELECT 1 FROM task_assignees ta
          WHERE ta.task_id = t.id
          AND ta.user_id = auth.uid()
        )
        OR t.assigned_to = auth.uid()
        OR public.user_has_role(ARRAY['super_admin', 'admin'])
        OR (
          t.project_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM project_members pm
            WHERE pm.project_id = t.project_id
            AND pm.user_id = auth.uid()
          )
        )
      )
    )
  );

-- INSERT policy "Only assigned users can create notes" (from 046) remains unchanged

-- ============================================
-- 4. Revert Task Files SELECT Policy
-- ============================================

DROP POLICY IF EXISTS "All users can view files for all tasks" ON task_files;

CREATE POLICY "Users can view files for accessible tasks" ON task_files
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_files.task_id
      AND t.deleted_at IS NULL
      AND (
        EXISTS (
          SELECT 1 FROM task_assignees ta
          WHERE ta.task_id = t.id
          AND ta.user_id = auth.uid()
        )
        OR t.assigned_to = auth.uid()
        OR public.user_has_role(ARRAY['super_admin', 'admin'])
        OR (
          t.project_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM project_members pm
            WHERE pm.project_id = t.project_id
            AND pm.user_id = auth.uid()
          )
        )
      )
    )
  );

-- INSERT policy "Only assigned users can upload files" (from 046) remains unchanged

-- ============================================
-- 5. Policies Left Unchanged
-- ============================================
-- INSERT policies on task_comments, task_notes, task_files (from 046) already
-- restrict writes to assigned users and admins -- no changes needed.
--
-- task_assignees SELECT (from 028): already assignment-based
-- Storage SELECT on storage.objects (from 028): already assignment-based
-- Projects RLS (from 013): regular users only see projects they are members of
-- Dashboard RPCs: SECURITY DEFINER functions that scope by assignment for staff
