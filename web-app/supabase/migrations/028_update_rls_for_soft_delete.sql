-- Migration 028: Update RLS Policies for Soft Delete
-- Updates all task-related RLS policies to filter out soft-deleted tasks
-- Super Admin can view soft-deleted tasks via separate queries (not in normal views)

-- ============================================
-- 1. Update Task SELECT Policies
-- ============================================

-- Drop existing task SELECT policies (handle all possible policy names)
DROP POLICY IF EXISTS "Senior consultants can view all tasks" ON tasks;
DROP POLICY IF EXISTS "Admins can view all tasks" ON tasks;
DROP POLICY IF EXISTS "Super admins and admins can view all tasks" ON tasks;
DROP POLICY IF EXISTS "Users can view assigned tasks" ON tasks;
DROP POLICY IF EXISTS "Users can view tasks in their projects" ON tasks;

-- Helper function to check assignment without RLS recursion
-- This avoids tasks <-> task_assignees policy loops
CREATE OR REPLACE FUNCTION public.user_is_task_assignee(p_task_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM task_assignees ta
    WHERE ta.task_id = p_task_id
      AND ta.user_id = p_user_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.user_is_task_assignee(UUID, UUID) TO authenticated;

-- Recreate with soft-delete filter
-- Combined policy for Super Admin and Admin (matches migration 013)
CREATE POLICY "Super admins and admins can view all tasks" ON tasks
  FOR SELECT USING (
    deleted_at IS NULL -- Exclude soft-deleted
    AND public.user_has_role(ARRAY['super_admin', 'admin'])
  );

-- Users can view assigned tasks (check both task_assignees and legacy assigned_to for backward compatibility)
CREATE POLICY "Users can view assigned tasks" ON tasks
  FOR SELECT USING (
    deleted_at IS NULL -- Exclude soft-deleted
    AND (
      -- Check new multi-assignee table (via helper to avoid recursion)
      public.user_is_task_assignee(tasks.id, auth.uid())
      -- OR check legacy assigned_to field (for backward compatibility)
      OR assigned_to = auth.uid()
    )
  );

-- Users can view tasks in their projects
CREATE POLICY "Users can view tasks in their projects" ON tasks
  FOR SELECT USING (
    deleted_at IS NULL -- Exclude soft-deleted
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

-- Users can update status on assigned tasks (but not soft-deleted)
-- Check both task_assignees and legacy assigned_to for backward compatibility
CREATE POLICY "Users can update status on assigned tasks" ON tasks
  FOR UPDATE 
  USING (
    deleted_at IS NULL -- Exclude soft-deleted
    AND (
      public.user_is_task_assignee(tasks.id, auth.uid())
      OR assigned_to = auth.uid() -- Legacy support
    )
    AND status != 'closed'
  )
  WITH CHECK (
    deleted_at IS NULL
    AND (
      public.user_is_task_assignee(tasks.id, auth.uid())
      OR assigned_to = auth.uid() -- Legacy support
    )
    AND status != 'closed'
  );

-- Admins can update tasks (but not soft-deleted)
CREATE POLICY "Admins and consultants can update tasks" ON tasks
  FOR UPDATE 
  USING (
    deleted_at IS NULL -- Exclude soft-deleted
    AND public.user_has_role(ARRAY['super_admin', 'admin'])
  )
  WITH CHECK (
    deleted_at IS NULL
    AND public.user_has_role(ARRAY['super_admin', 'admin'])
  );

-- ============================================
-- 3. Update Task Comments Policies
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view comments for accessible tasks" ON task_comments;
DROP POLICY IF EXISTS "Assigned users or super admin can create comments" ON task_comments;

-- Users can view comments for accessible non-deleted tasks
-- Check both task_assignees and legacy assigned_to for backward compatibility
CREATE POLICY "Users can view comments for accessible tasks" ON task_comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_comments.task_id
      AND t.deleted_at IS NULL -- Exclude soft-deleted tasks
      AND (
        EXISTS (
          SELECT 1 FROM task_assignees ta
          WHERE ta.task_id = t.id
          AND ta.user_id = auth.uid()
        )
        OR t.assigned_to = auth.uid() -- Legacy support
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

-- Users can create comments on accessible non-deleted tasks
-- Check both task_assignees and legacy assigned_to for backward compatibility
CREATE POLICY "Assigned users or super admin can create comments" ON task_comments
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_comments.task_id
      AND t.deleted_at IS NULL -- Exclude soft-deleted tasks
      AND t.status != 'closed'
      AND (
        EXISTS (
          SELECT 1 FROM task_assignees ta
          WHERE ta.task_id = t.id
          AND ta.user_id = auth.uid()
        )
        OR t.assigned_to = auth.uid() -- Legacy support
        OR public.user_has_role(ARRAY['super_admin'])
      )
    )
  );

-- ============================================
-- 4. Update Task Notes Policies
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view notes for accessible tasks" ON task_notes;
DROP POLICY IF EXISTS "Assigned users or super admin can create notes" ON task_notes;

-- Users can view notes for accessible non-deleted tasks
-- Check both task_assignees and legacy assigned_to for backward compatibility
CREATE POLICY "Users can view notes for accessible tasks" ON task_notes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_notes.task_id
      AND t.deleted_at IS NULL -- Exclude soft-deleted tasks
      AND (
        EXISTS (
          SELECT 1 FROM task_assignees ta
          WHERE ta.task_id = t.id
          AND ta.user_id = auth.uid()
        )
        OR t.assigned_to = auth.uid() -- Legacy support
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

-- Users can create notes on accessible non-deleted tasks
-- Check both task_assignees and legacy assigned_to for backward compatibility
CREATE POLICY "Assigned users or super admin can create notes" ON task_notes
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_notes.task_id
      AND t.deleted_at IS NULL -- Exclude soft-deleted tasks
      AND t.status != 'closed'
      AND (
        EXISTS (
          SELECT 1 FROM task_assignees ta
          WHERE ta.task_id = t.id
          AND ta.user_id = auth.uid()
        )
        OR t.assigned_to = auth.uid() -- Legacy support
        OR public.user_has_role(ARRAY['super_admin'])
      )
    )
  );

-- ============================================
-- 5. Update Task Files Policies
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view files for accessible tasks" ON task_files;
DROP POLICY IF EXISTS "Assigned users or super admin can upload files" ON task_files;

-- Users can view files for accessible non-deleted tasks
-- Check both task_assignees and legacy assigned_to for backward compatibility
CREATE POLICY "Users can view files for accessible tasks" ON task_files
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_files.task_id
      AND t.deleted_at IS NULL -- Exclude soft-deleted tasks
      AND (
        EXISTS (
          SELECT 1 FROM task_assignees ta
          WHERE ta.task_id = t.id
          AND ta.user_id = auth.uid()
        )
        OR t.assigned_to = auth.uid() -- Legacy support
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

-- Users can upload files to accessible non-deleted tasks
-- Check both task_assignees and legacy assigned_to for backward compatibility
CREATE POLICY "Assigned users or super admin can upload files" ON task_files
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_files.task_id
      AND t.deleted_at IS NULL -- Exclude soft-deleted tasks
      AND t.status != 'closed'
      AND (
        EXISTS (
          SELECT 1 FROM task_assignees ta
          WHERE ta.task_id = t.id
          AND ta.user_id = auth.uid()
        )
        OR t.assigned_to = auth.uid() -- Legacy support
        OR public.user_has_role(ARRAY['super_admin'])
      )
    )
  );

-- ============================================
-- 6. Update Task Progress Log Policies
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view progress logs for accessible tasks" ON task_progress_log;
DROP POLICY IF EXISTS "Assigned users can create progress logs" ON task_progress_log;

-- Users can view progress logs for accessible non-deleted tasks
-- Check both task_assignees and legacy assigned_to for backward compatibility
CREATE POLICY "Users can view progress logs for accessible tasks" ON task_progress_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_progress_log.task_id
      AND t.deleted_at IS NULL -- Exclude soft-deleted tasks
      AND (
        EXISTS (
          SELECT 1 FROM task_assignees ta
          WHERE ta.task_id = t.id
          AND ta.user_id = auth.uid()
        )
        OR t.assigned_to = auth.uid() -- Legacy support
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

-- Assigned users can create progress logs for non-deleted tasks
-- Check both task_assignees and legacy assigned_to for backward compatibility
CREATE POLICY "Assigned users can create progress logs" ON task_progress_log
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_progress_log.task_id
      AND t.deleted_at IS NULL -- Exclude soft-deleted tasks
      AND (
        EXISTS (
          SELECT 1 FROM task_assignees ta
          WHERE ta.task_id = t.id
          AND ta.user_id = auth.uid()
        )
        OR t.assigned_to = auth.uid() -- Legacy support
      )
    )
  );

-- ============================================
-- 7. Update Task Assignees Policies for Soft Delete
-- ============================================

-- Drop existing task_assignees policy
DROP POLICY IF EXISTS "Users can view assignees for accessible tasks" ON task_assignees;

-- Recreate with soft-delete filter
-- Avoid recursion: check if user is the assignee directly, or is admin, or is project member
-- Don't query task_assignees inside the policy to avoid infinite recursion
CREATE POLICY "Users can view assignees for accessible tasks" ON task_assignees
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_assignees.task_id
      AND t.deleted_at IS NULL -- Exclude soft-deleted tasks
      AND (
        -- User is the assignee themselves (direct check, no recursion)
        task_assignees.user_id = auth.uid()
        -- Or user is admin/super_admin
        OR public.user_has_role(ARRAY['super_admin', 'admin'])
        -- Or task is assigned to user via legacy assigned_to field
        OR t.assigned_to = auth.uid() -- Legacy support
        -- Or user is project member (if task has project)
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
-- 8. Update Storage Policies for Task Files
-- ============================================

-- Drop existing storage policies
DROP POLICY IF EXISTS "Users can view task files" ON storage.objects;

-- Users can view files for accessible non-deleted tasks
-- Check both task_assignees and legacy assigned_to for backward compatibility
CREATE POLICY "Users can view task files" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'task-files'
    AND EXISTS (
      SELECT 1 FROM tasks t
      JOIN task_files tf ON (
        tf.file_path = storage.objects.name 
        OR tf.file_path = 'task-files/' || storage.objects.name
        OR 'task-files/' || tf.file_path = storage.objects.name
      )
      WHERE tf.task_id = t.id
      AND t.deleted_at IS NULL -- Exclude soft-deleted tasks
      AND (
        EXISTS (
          SELECT 1 FROM task_assignees ta
          WHERE ta.task_id = t.id
          AND ta.user_id = auth.uid()
        )
        OR t.assigned_to = auth.uid() -- Legacy support
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
-- 9. Add Policy for Super Admin to View Deleted Tasks
-- ============================================

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Super Admin can view deleted tasks" ON tasks;

-- Super Admin can view soft-deleted tasks (for restore functionality)
CREATE POLICY "Super Admin can view deleted tasks" ON tasks
  FOR SELECT USING (
    deleted_at IS NOT NULL -- Only deleted tasks
    AND public.user_has_role(ARRAY['super_admin'])
  );

-- ============================================
-- 10. Add Policy for Super Admin to Soft Delete Tasks
-- ============================================

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Super Admin can soft delete tasks" ON tasks;

-- Only Super Admin can set deleted_at and deleted_by
-- This is enforced via UPDATE policy with WITH CHECK
-- Note: OLD is not available in WITH CHECK, so we allow Super Admin to set deleted_at/deleted_by
-- The USING clause ensures only Super Admin can update, and application logic ensures proper usage
CREATE POLICY "Super Admin can soft delete tasks" ON tasks
  FOR UPDATE USING (
    public.user_has_role(ARRAY['super_admin'])
  )
  WITH CHECK (
    public.user_has_role(ARRAY['super_admin'])
    -- Allow Super Admin to set deleted_at/deleted_by (soft delete or restore)
    -- Application logic and database functions ensure proper usage
  );

-- ============================================
-- 11. Update Users Policies for Soft Delete
-- ============================================

-- Drop existing user policies that need soft-delete filtering
DROP POLICY IF EXISTS "Super admins and admins can view all users" ON users;

-- Recreate with soft-delete filter
CREATE POLICY "Super admins and admins can view all users" ON users
  FOR SELECT USING (
    deleted_at IS NULL -- Exclude soft-deleted users
    AND public.user_has_role(ARRAY['super_admin', 'admin'])
  );

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Super Admin can view deleted users" ON users;
DROP POLICY IF EXISTS "Super Admin can soft delete users" ON users;

-- Super Admin can view soft-deleted users (for restore functionality)
CREATE POLICY "Super Admin can view deleted users" ON users
  FOR SELECT USING (
    deleted_at IS NOT NULL -- Only deleted users
    AND public.user_has_role(ARRAY['super_admin'])
  );

-- Super Admin can soft delete users
-- Note: OLD is not available in WITH CHECK, so we allow Super Admin to set deleted_at/deleted_by
-- The USING clause ensures only Super Admin can update, and application logic ensures proper usage
CREATE POLICY "Super Admin can soft delete users" ON users
  FOR UPDATE USING (
    public.user_has_role(ARRAY['super_admin'])
  )
  WITH CHECK (
    public.user_has_role(ARRAY['super_admin'])
    -- Allow Super Admin to set deleted_at/deleted_by (soft delete or restore)
    -- Application logic and database functions ensure proper usage
  );

-- ============================================
-- 12. Fix Circular Dependency: Projects Policy
-- ============================================

-- Drop the policy that causes infinite recursion
-- Migration 015 created a policy that queries tasks from projects, causing recursion
-- The issue: When querying tasks (with projects join), projects RLS policy checks tasks,
-- which triggers tasks RLS policy, which might check projects again = infinite recursion
-- 
-- SOLUTION: Remove this policy entirely. Users can view projects through:
-- 1. Being project members (existing policy)
-- 2. Being admin/super_admin (existing policy)
-- 3. Application-level logic can handle showing projects for assigned tasks
--    (This is a UI convenience feature, not a security requirement)
DROP POLICY IF EXISTS "Users can view projects for assigned tasks" ON projects;

-- Note: The original policy was added to fix "Unknown Project" display issues.
-- This can be handled at the application level by:
-- - Fetching project details separately when needed
-- - Using the project_id from tasks to fetch project info with proper permissions
-- - Or creating a database view that handles this without RLS recursion
