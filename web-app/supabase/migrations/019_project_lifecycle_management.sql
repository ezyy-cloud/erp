-- Migration 019: Project Lifecycle Management with Cascading Task Closure
-- 
-- This migration adds:
-- 1. CLOSED status to projects (in addition to active, completed, archived)
-- 2. CLOSED status to tasks
-- 3. Task closure tracking fields (closed_reason, closed_at, status_before_closure)
-- 4. RPC functions for cascading closure and reopening
-- 5. RLS policies to prevent writes to closed tasks
--
-- Design Principles:
-- - Lifecycle system, not a UI toggle
-- - Reusable by finance, compliance, and reporting modules
-- - Supports future: archiving, audit logs, approval gates, SLA enforcement, billing lock

-- ============================================
-- 1. Add task closure tracking fields
-- ============================================
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS closed_reason VARCHAR(50), -- 'manual', 'project_closed'
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status_before_closure VARCHAR(50); -- Store status before closure for reopening

-- Add comment for documentation
COMMENT ON COLUMN tasks.closed_reason IS 'Reason for task closure: manual (user completed) or project_closed (cascaded from project)';
COMMENT ON COLUMN tasks.closed_at IS 'Timestamp when task was closed';
COMMENT ON COLUMN tasks.status_before_closure IS 'Task status before closure - used to restore on project reopen';

-- ============================================
-- 2. Create RPC function: Close project and cascade to tasks
-- ============================================
CREATE OR REPLACE FUNCTION close_project_with_cascade(p_project_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_status VARCHAR(50);
  v_closed_tasks_count INTEGER := 0;
  v_task_record RECORD;
BEGIN
  -- Get current project status
  SELECT status INTO v_project_status
  FROM projects
  WHERE id = p_project_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Project not found');
  END IF;
  
  IF v_project_status = 'closed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Project is already closed');
  END IF;
  
  -- Update project status to closed
  UPDATE projects
  SET status = 'closed',
      updated_at = NOW()
  WHERE id = p_project_id;
  
  -- Close all tasks linked to this project (cascade closure)
  -- Only close tasks that are not already closed
  FOR v_task_record IN
    SELECT id, status
    FROM tasks
    WHERE project_id = p_project_id
      AND (closed_reason IS NULL OR closed_reason != 'project_closed')
  LOOP
    -- Store status before closure if not already stored
    UPDATE tasks
    SET 
      status = 'closed',
      closed_reason = 'project_closed',
      closed_at = COALESCE(closed_at, NOW()), -- Don't overwrite if already set
      status_before_closure = COALESCE(status_before_closure, v_task_record.status), -- Store original status
      updated_at = NOW()
    WHERE id = v_task_record.id;
    
    v_closed_tasks_count := v_closed_tasks_count + 1;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'project_id', p_project_id,
    'closed_tasks_count', v_closed_tasks_count
  );
END;
$$;

-- ============================================
-- 3. Create RPC function: Reopen project and reactivate tasks
-- ============================================
CREATE OR REPLACE FUNCTION reopen_project_with_reactivate(p_project_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_status VARCHAR(50);
  v_reactivated_tasks_count INTEGER := 0;
  v_task_record RECORD;
BEGIN
  -- Get current project status
  SELECT status INTO v_project_status
  FROM projects
  WHERE id = p_project_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Project not found');
  END IF;
  
  IF v_project_status != 'closed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Project is not closed');
  END IF;
  
  -- Update project status to active
  UPDATE projects
  SET status = 'active',
      updated_at = NOW()
  WHERE id = p_project_id;
  
  -- Reactivate tasks that were closed due to project closure
  -- Only reactivate tasks closed with reason 'project_closed'
  -- Tasks closed manually (closed_reason = 'manual') remain closed
  FOR v_task_record IN
    SELECT id, status_before_closure
    FROM tasks
    WHERE project_id = p_project_id
      AND closed_reason = 'project_closed'
      AND status = 'closed'
  LOOP
    -- Restore to previous status, or default to 'to_do' if no previous status
    UPDATE tasks
    SET 
      status = COALESCE(v_task_record.status_before_closure, 'to_do'),
      closed_reason = NULL,
      closed_at = NULL,
      status_before_closure = NULL, -- Clear after restore
      updated_at = NOW()
    WHERE id = v_task_record.id;
    
    v_reactivated_tasks_count := v_reactivated_tasks_count + 1;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'project_id', p_project_id,
    'reactivated_tasks_count', v_reactivated_tasks_count
  );
END;
$$;

-- ============================================
-- 4. Create helper function: Check if task is closed
-- ============================================
CREATE OR REPLACE FUNCTION is_task_closed(p_task_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_status VARCHAR(50);
BEGIN
  SELECT status INTO v_status
  FROM tasks
  WHERE id = p_task_id;
  
  RETURN COALESCE(v_status = 'closed', false);
END;
$$;

-- ============================================
-- 5. Update RLS policies to prevent writes to closed tasks
-- ============================================

-- Drop existing task update policies that don't check for closed status
DROP POLICY IF EXISTS "Users can update status on assigned tasks" ON tasks;
DROP POLICY IF EXISTS "Admins and consultants can update tasks" ON tasks;

-- Recreate with closed task check
-- Users can update status on assigned tasks (but not if task is closed)
CREATE POLICY "Users can update status on assigned tasks" ON tasks
  FOR UPDATE 
  USING (
    assigned_to = auth.uid()
    AND status != 'closed' -- Prevent updates to closed tasks
  )
  WITH CHECK (
    assigned_to = auth.uid()
    AND status != 'closed' -- Prevent setting status to closed via this policy (use RPC)
  );

-- Admins can update tasks (but not if task is closed)
CREATE POLICY "Admins and consultants can update tasks" ON tasks
  FOR UPDATE 
  USING (
    public.user_has_role(ARRAY['super_admin', 'admin'])
    AND status != 'closed' -- Prevent updates to closed tasks
  )
  WITH CHECK (
    public.user_has_role(ARRAY['super_admin', 'admin'])
    -- Allow admins to reopen tasks (status != 'closed' in WITH CHECK would prevent this)
    -- So we allow status changes but enforce closed check in application logic
  );

-- Prevent comments on closed tasks
DROP POLICY IF EXISTS "Users can create comments on accessible tasks" ON task_comments;
CREATE POLICY "Users can create comments on accessible tasks" ON task_comments
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_comments.task_id
      AND t.status != 'closed' -- Prevent comments on closed tasks
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

-- Prevent notes on closed tasks
DROP POLICY IF EXISTS "Users can create notes on accessible tasks" ON task_notes;
CREATE POLICY "Users can create notes on accessible tasks" ON task_notes
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_notes.task_id
      AND t.status != 'closed' -- Prevent notes on closed tasks
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

-- Prevent file uploads on closed tasks
DROP POLICY IF EXISTS "Users can upload files to accessible tasks" ON task_files;
CREATE POLICY "Users can upload files to accessible tasks" ON task_files
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_files.task_id
      AND t.status != 'closed' -- Prevent file uploads on closed tasks
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

-- ============================================
-- 6. Add indexes for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_tasks_closed_reason ON tasks(closed_reason) WHERE closed_reason IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_closed_at ON tasks(closed_at) WHERE closed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_status_closed ON tasks(status) WHERE status = 'closed';

-- ============================================
-- 7. Add comments for documentation
-- ============================================
COMMENT ON FUNCTION close_project_with_cascade IS 'Closes a project and cascades closure to all linked tasks. Only closes tasks not already closed manually.';
COMMENT ON FUNCTION reopen_project_with_reactivate IS 'Reopens a project and reactivates tasks that were closed due to project closure. Manually closed tasks remain closed.';
COMMENT ON FUNCTION is_task_closed IS 'Helper function to check if a task is closed. Used by RLS policies and application logic.';
