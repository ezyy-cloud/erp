-- Migration 025: Create Task Assignees Join Table
-- Implements multi-user task assignment (many-to-many relationship)
-- Replaces single assignee model with explicit assignment tracking

-- Create task_assignees table
CREATE TABLE IF NOT EXISTS task_assignees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE(task_id, user_id) -- Prevent duplicate assignments
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_task_assignees_task_id ON task_assignees(task_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_user_id ON task_assignees(user_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_assigned_at ON task_assignees(assigned_at);

-- Add comment for documentation
COMMENT ON TABLE task_assignees IS 'Many-to-many relationship between tasks and users. Tracks all assignees for a task with assignment metadata.';
COMMENT ON COLUMN task_assignees.assigned_by IS 'User who made the assignment (for audit trail)';

-- Enable RLS
ALTER TABLE task_assignees ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view assignees for tasks they can view
-- Same visibility rules as tasks (assigned users, admins, project members)
-- Note: deleted_at check will be added in migration 028
CREATE POLICY "Users can view assignees for accessible tasks" ON task_assignees
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_assignees.task_id
      AND (
        -- User is assigned to this task
        EXISTS (
          SELECT 1 FROM task_assignees ta
          WHERE ta.task_id = t.id
          AND ta.user_id = auth.uid()
        )
        -- Or user is admin/super_admin
        OR public.user_has_role(ARRAY['super_admin', 'admin'])
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

-- RLS Policy: Users with canAssignTasks permission can create assignments
-- This includes Admin and Super Admin
CREATE POLICY "Users with assign permission can create assignments" ON task_assignees
  FOR INSERT WITH CHECK (
    assigned_by = auth.uid()
    AND public.user_has_role(ARRAY['super_admin', 'admin'])
  );

-- RLS Policy: Only Super Admin can delete assignments (for reassignment)
CREATE POLICY "Super Admin can delete assignments" ON task_assignees
  FOR DELETE USING (
    public.user_has_role(ARRAY['super_admin'])
  );

-- No update policy - assignments are immutable (delete and recreate if needed)
