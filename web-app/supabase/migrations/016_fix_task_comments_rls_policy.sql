-- Migration 016: Fix Task Comments, Notes, and Files RLS Policies
-- Updates task_comments, task_notes, and task_files policies to use user_has_role function
-- This avoids RLS recursion issues when checking user roles

-- ============================================
-- Task Comments Policies
-- ============================================
DROP POLICY IF EXISTS "Users can view comments for accessible tasks" ON task_comments;
DROP POLICY IF EXISTS "Users can create comments on accessible tasks" ON task_comments;

CREATE POLICY "Users can view comments for accessible tasks" ON task_comments
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_comments.task_id
      AND (
        t.assigned_to = auth.uid()
        OR public.user_has_role(ARRAY['super_admin', 'admin'])
        OR EXISTS (
          SELECT 1 FROM project_members pm
          WHERE pm.project_id = t.project_id
          AND pm.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can create comments on accessible tasks" ON task_comments
  FOR INSERT 
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_comments.task_id
      AND (
        t.assigned_to = auth.uid()
        OR public.user_has_role(ARRAY['super_admin', 'admin'])
        OR EXISTS (
          SELECT 1 FROM project_members pm
          WHERE pm.project_id = t.project_id
          AND pm.user_id = auth.uid()
        )
      )
    )
  );

-- ============================================
-- Task Notes Policies
-- ============================================
DROP POLICY IF EXISTS "Users can view notes for accessible tasks" ON task_notes;
DROP POLICY IF EXISTS "Users can create notes on accessible tasks" ON task_notes;

CREATE POLICY "Users can view notes for accessible tasks" ON task_notes
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_notes.task_id
      AND (
        t.assigned_to = auth.uid()
        OR public.user_has_role(ARRAY['super_admin', 'admin'])
        OR EXISTS (
          SELECT 1 FROM project_members pm
          WHERE pm.project_id = t.project_id
          AND pm.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can create notes on accessible tasks" ON task_notes
  FOR INSERT 
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_notes.task_id
      AND (
        t.assigned_to = auth.uid()
        OR public.user_has_role(ARRAY['super_admin', 'admin'])
        OR EXISTS (
          SELECT 1 FROM project_members pm
          WHERE pm.project_id = t.project_id
          AND pm.user_id = auth.uid()
        )
      )
    )
  );

-- ============================================
-- Task Files Policies
-- ============================================
DROP POLICY IF EXISTS "Users can view files for accessible tasks" ON task_files;
DROP POLICY IF EXISTS "Users can upload files to accessible tasks" ON task_files;

CREATE POLICY "Users can view files for accessible tasks" ON task_files
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_files.task_id
      AND (
        t.assigned_to = auth.uid()
        OR public.user_has_role(ARRAY['super_admin', 'admin'])
        OR EXISTS (
          SELECT 1 FROM project_members pm
          WHERE pm.project_id = t.project_id
          AND pm.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can upload files to accessible tasks" ON task_files
  FOR INSERT 
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_files.task_id
      AND (
        t.assigned_to = auth.uid()
        OR public.user_has_role(ARRAY['super_admin', 'admin'])
        OR EXISTS (
          SELECT 1 FROM project_members pm
          WHERE pm.project_id = t.project_id
          AND pm.user_id = auth.uid()
        )
      )
    )
  );
