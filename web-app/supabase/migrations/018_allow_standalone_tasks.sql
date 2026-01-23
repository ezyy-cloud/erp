-- Migration 018: Allow Standalone Tasks (Nullable project_id)
-- Enables tasks to exist without being associated with a project
-- This supports operational tasks like "paying bills" that don't belong to a specific project
-- 
-- Use Cases:
-- - Admin operational tasks (e.g., paying bills, administrative work)
-- - Tasks that don't fit into project structure
-- - Future expansion for different task grouping methods

-- Step 1: Drop the NOT NULL constraint on project_id
ALTER TABLE tasks 
  ALTER COLUMN project_id DROP NOT NULL;

-- Step 2: Update foreign key constraint to allow NULL
-- The existing foreign key already supports NULL (ON DELETE CASCADE doesn't prevent NULL)
-- But we need to ensure the constraint allows NULL explicitly
-- PostgreSQL foreign keys allow NULL by default, so this should already work

-- Step 3: Add a check constraint or comment to document the change
COMMENT ON COLUMN tasks.project_id IS 'Project ID - NULL for standalone tasks that are not part of any project';

-- Step 4: Update RLS policies to handle NULL project_id
-- Tasks with NULL project_id should be visible to:
-- - Super Admin: All tasks (already covered by existing policy)
-- - Admin: All tasks (already covered by existing policy)
-- - User: Only if assigned to them (already covered by "Users can view assigned tasks" policy)

-- The existing task policies already handle standalone tasks correctly:
-- - "Users can view assigned tasks" uses: assigned_to = auth.uid() (works for NULL project_id)
-- - "Users can view tasks in their projects" uses project_id join (won't match NULL, but that's OK)

-- However, policies for task_comments, task_notes, and task_files check project_id in joins
-- These need to be updated to handle NULL project_id (standalone tasks)

-- Update task_comments policy to handle standalone tasks
DROP POLICY IF EXISTS "Users can view comments for accessible tasks" ON task_comments;
CREATE POLICY "Users can view comments for accessible tasks" ON task_comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_comments.task_id
      AND (
        t.assigned_to = auth.uid()
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

DROP POLICY IF EXISTS "Users can create comments on accessible tasks" ON task_comments;
CREATE POLICY "Users can create comments on accessible tasks" ON task_comments
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_comments.task_id
      AND (
        t.assigned_to = auth.uid()
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

-- Update task_notes policy to handle standalone tasks
DROP POLICY IF EXISTS "Users can view notes for accessible tasks" ON task_notes;
CREATE POLICY "Users can view notes for accessible tasks" ON task_notes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_notes.task_id
      AND (
        t.assigned_to = auth.uid()
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

DROP POLICY IF EXISTS "Users can create notes on accessible tasks" ON task_notes;
CREATE POLICY "Users can create notes on accessible tasks" ON task_notes
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_notes.task_id
      AND (
        t.assigned_to = auth.uid()
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

-- Update task_files policy to handle standalone tasks
DROP POLICY IF EXISTS "Users can view files for accessible tasks" ON task_files;
CREATE POLICY "Users can view files for accessible tasks" ON task_files
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_files.task_id
      AND (
        t.assigned_to = auth.uid()
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

DROP POLICY IF EXISTS "Users can upload files to accessible tasks" ON task_files;
CREATE POLICY "Users can upload files to accessible tasks" ON task_files
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_files.task_id
      AND (
        t.assigned_to = auth.uid()
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
