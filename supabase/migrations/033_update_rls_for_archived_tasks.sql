-- Migration 033: Update RLS Policies for Archived Tasks
-- Updates task RLS policies to exclude archived tasks from normal views
-- Super Admin can view archived tasks via separate queries (not in normal views)

-- ============================================
-- 1. Update Task SELECT Policies
-- ============================================

-- Drop existing task SELECT policies
DROP POLICY IF EXISTS "Super admins and admins can view all tasks" ON tasks;
DROP POLICY IF EXISTS "Users can view assigned tasks" ON tasks;
DROP POLICY IF EXISTS "Users can view tasks in their projects" ON tasks;

-- Recreate with archived task filter
-- Super Admin and Admin can view all non-archived tasks
-- Super Admin can also view archived tasks via separate policy
CREATE POLICY "Super admins and admins can view all active tasks" ON tasks
  FOR SELECT USING (
    deleted_at IS NULL -- Exclude soft-deleted
    AND archived_at IS NULL -- Exclude archived tasks from normal views
    AND public.user_has_role(ARRAY['super_admin', 'admin'])
  );

-- Super Admin can view archived tasks (separate policy for archived view)
CREATE POLICY "Super admins can view archived tasks" ON tasks
  FOR SELECT USING (
    deleted_at IS NULL -- Exclude soft-deleted
    AND archived_at IS NOT NULL -- Only archived tasks
    AND public.user_has_role(ARRAY['super_admin'])
  );

-- Users can view assigned tasks (but not archived)
CREATE POLICY "Users can view assigned tasks" ON tasks
  FOR SELECT USING (
    deleted_at IS NULL -- Exclude soft-deleted
    AND archived_at IS NULL -- Exclude archived tasks
    AND (
      -- Check new multi-assignee table (via helper to avoid recursion)
      public.user_is_task_assignee(tasks.id, auth.uid())
      -- OR check legacy assigned_to field (for backward compatibility)
      OR assigned_to = auth.uid()
    )
  );

-- Users can view tasks in their projects (but not archived)
CREATE POLICY "Users can view tasks in their projects" ON tasks
  FOR SELECT USING (
    deleted_at IS NULL -- Exclude soft-deleted
    AND archived_at IS NULL -- Exclude archived tasks
    AND project_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = tasks.project_id
      AND pm.user_id = auth.uid()
    )
  );

-- ============================================
-- 2. Update Task UPDATE Policies
-- ============================================

-- Drop existing update policies
DROP POLICY IF EXISTS "Users can update status on assigned tasks" ON tasks;
DROP POLICY IF EXISTS "Admins and consultants can update tasks" ON tasks;

-- Users can update status on assigned tasks (but not archived or soft-deleted)
CREATE POLICY "Users can update status on assigned tasks" ON tasks
  FOR UPDATE 
  USING (
    deleted_at IS NULL -- Exclude soft-deleted
    AND archived_at IS NULL -- Exclude archived tasks
    AND (
      public.user_is_task_assignee(tasks.id, auth.uid())
      OR assigned_to = auth.uid() -- Legacy support
    )
    AND status != 'closed'
  )
  WITH CHECK (
    deleted_at IS NULL
    AND archived_at IS NULL -- Exclude archived tasks
    AND (
      public.user_is_task_assignee(tasks.id, auth.uid())
      OR assigned_to = auth.uid() -- Legacy support
    )
    AND status != 'closed'
  );

-- Admins can update tasks (but not archived or soft-deleted)
CREATE POLICY "Admins and consultants can update tasks" ON tasks
  FOR UPDATE 
  USING (
    deleted_at IS NULL -- Exclude soft-deleted
    AND archived_at IS NULL -- Exclude archived tasks
    AND public.user_has_role(ARRAY['super_admin', 'admin'])
  )
  WITH CHECK (
    deleted_at IS NULL
    AND archived_at IS NULL -- Exclude archived tasks
    AND public.user_has_role(ARRAY['super_admin', 'admin'])
  );

-- Super Admin can unarchive tasks (update archived tasks to unarchive them)
CREATE POLICY "Super admins can unarchive tasks" ON tasks
  FOR UPDATE
  USING (
    deleted_at IS NULL
    AND archived_at IS NOT NULL -- Only archived tasks
    AND public.user_has_role(ARRAY['super_admin'])
  )
  WITH CHECK (
    deleted_at IS NULL
    AND public.user_has_role(ARRAY['super_admin'])
  );

-- ============================================
-- 3. Update Task Comments Policies
-- ============================================

-- Prevent comments on archived tasks
DROP POLICY IF EXISTS "Users can create comments on accessible tasks" ON task_comments;
CREATE POLICY "Users can create comments on accessible tasks" ON task_comments
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_comments.task_id
      AND t.deleted_at IS NULL
      AND t.archived_at IS NULL -- Prevent comments on archived tasks
      AND t.status != 'closed'
      AND (
        public.user_is_task_assignee(t.id, auth.uid())
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

-- ============================================
-- 4. Update Task Notes Policies
-- ============================================

-- Prevent notes on archived tasks
DROP POLICY IF EXISTS "Users can create notes on accessible tasks" ON task_notes;
CREATE POLICY "Users can create notes on accessible tasks" ON task_notes
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_notes.task_id
      AND t.deleted_at IS NULL
      AND t.archived_at IS NULL -- Prevent notes on archived tasks
      AND t.status != 'closed'
      AND (
        public.user_is_task_assignee(t.id, auth.uid())
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

-- ============================================
-- 5. Update Task Files Policies
-- ============================================

-- Prevent file uploads on archived tasks
-- Note: This assumes task_files table has similar policies
-- Update if your task_files policies differ
