-- Migration 046: Enable All Users to View All Tasks
-- Updates RLS policies to allow all authenticated users to view all tasks
-- while maintaining interaction restrictions (comments, notes, files) to assigned users only

-- ============================================
-- 1. Update Task SELECT Policies
-- ============================================

-- Drop existing restrictive SELECT policies for regular users
DROP POLICY IF EXISTS "Users can view assigned tasks" ON tasks;
DROP POLICY IF EXISTS "Users can view tasks in their projects" ON tasks;

-- Create new policy: All authenticated users can view all active tasks
-- This enables transparency - all users can see all tasks, but only assigned users can interact
CREATE POLICY "All authenticated users can view all active tasks" ON tasks
  FOR SELECT USING (
    deleted_at IS NULL -- Exclude soft-deleted
    AND archived_at IS NULL -- Exclude archived tasks from normal views
  );

-- Note: Super Admin and Admin policies remain unchanged (they can still view all tasks)
-- The new policy above allows regular users to also view all tasks

-- ============================================
-- 2. Update Task Comments Policies
-- ============================================

-- Update comment SELECT policy to allow all users to view comments for all tasks
DROP POLICY IF EXISTS "Users can view comments for accessible tasks" ON task_comments;
CREATE POLICY "All users can view comments for all tasks" ON task_comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_comments.task_id
      AND t.deleted_at IS NULL
      AND t.archived_at IS NULL
    )
  );

-- Update comment INSERT policy to restrict to assigned users only
DROP POLICY IF EXISTS "Users can create comments on accessible tasks" ON task_comments;
CREATE POLICY "Only assigned users can create comments" ON task_comments
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_comments.task_id
      AND t.deleted_at IS NULL
      AND t.archived_at IS NULL
      AND t.status != 'closed'
      AND (
        -- User must be assigned to the task
        public.user_is_task_assignee(t.id, auth.uid())
        OR t.assigned_to = auth.uid() -- Legacy support
        OR public.user_has_role(ARRAY['super_admin', 'admin']) -- Admins can always comment
      )
    )
  );

-- ============================================
-- 3. Update Task Notes Policies
-- ============================================

-- Update note SELECT policy to allow all users to view notes for all tasks
DROP POLICY IF EXISTS "Users can view notes for accessible tasks" ON task_notes;
CREATE POLICY "All users can view notes for all tasks" ON task_notes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_notes.task_id
      AND t.deleted_at IS NULL
      AND t.archived_at IS NULL
    )
  );

-- Update note INSERT policy to restrict to assigned users only
DROP POLICY IF EXISTS "Users can create notes on accessible tasks" ON task_notes;
CREATE POLICY "Only assigned users can create notes" ON task_notes
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_notes.task_id
      AND t.deleted_at IS NULL
      AND t.archived_at IS NULL
      AND t.status != 'closed'
      AND (
        -- User must be assigned to the task
        public.user_is_task_assignee(t.id, auth.uid())
        OR t.assigned_to = auth.uid() -- Legacy support
        OR public.user_has_role(ARRAY['super_admin', 'admin']) -- Admins can always add notes
      )
    )
  );

-- ============================================
-- 4. Update Task Files Policies
-- ============================================

-- Update file SELECT policy to allow all users to view files for all tasks
DROP POLICY IF EXISTS "Users can view files for accessible tasks" ON task_files;
CREATE POLICY "All users can view files for all tasks" ON task_files
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_files.task_id
      AND t.deleted_at IS NULL
      AND t.archived_at IS NULL
    )
  );

-- Update file INSERT policy to restrict to assigned users only
DROP POLICY IF EXISTS "Users can upload files to accessible tasks" ON task_files;
CREATE POLICY "Only assigned users can upload files" ON task_files
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_files.task_id
      AND t.deleted_at IS NULL
      AND t.archived_at IS NULL
      AND t.status != 'closed'
      AND (
        -- User must be assigned to the task
        public.user_is_task_assignee(t.id, auth.uid())
        OR t.assigned_to = auth.uid() -- Legacy support
        OR public.user_has_role(ARRAY['super_admin', 'admin']) -- Admins can always upload files
      )
    )
  );

-- ============================================
-- 5. Comments
-- ============================================

COMMENT ON POLICY "All authenticated users can view all active tasks" ON tasks IS 
  'Allows all authenticated users to view all non-archived, non-deleted tasks for transparency. Interaction restrictions are enforced at INSERT level.';

COMMENT ON POLICY "Only assigned users can create comments" ON task_comments IS 
  'Restricts comment creation to assigned users only, while allowing all users to view comments.';

COMMENT ON POLICY "Only assigned users can create notes" ON task_notes IS 
  'Restricts note creation to assigned users only, while allowing all users to view notes.';

COMMENT ON POLICY "Only assigned users can upload files" ON task_files IS 
  'Restricts file uploads to assigned users only, while allowing all users to view files.';
