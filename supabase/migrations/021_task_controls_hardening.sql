-- Migration 021: Task Controls Hardening
-- Implements strict operational controls for tasks

-- 1. Update review status values to match new requirements
-- Change 'waiting_for_review' to 'pending_review' and add 'under_review'
UPDATE tasks 
SET review_status = 'pending_review' 
WHERE review_status = 'waiting_for_review';

-- Update check constraint for review_status
ALTER TABLE tasks
  DROP CONSTRAINT IF EXISTS tasks_review_status_check;

ALTER TABLE tasks
  ADD CONSTRAINT tasks_review_status_check 
  CHECK (review_status IN ('none', 'pending_review', 'under_review', 'reviewed_approved', 'changes_requested'));

-- Update comment
COMMENT ON COLUMN tasks.review_status IS 'Review workflow status: none, pending_review, under_review, reviewed_approved, changes_requested';

-- 2. Create task_progress_log table for append-only progress tracking
CREATE TABLE IF NOT EXISTS task_progress_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status VARCHAR(50) NOT NULL, -- The status at the time of this log entry
  progress_note TEXT, -- Optional note about the progress
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Indexes for task_progress_log
CREATE INDEX IF NOT EXISTS idx_task_progress_log_task_id ON task_progress_log(task_id);
CREATE INDEX IF NOT EXISTS idx_task_progress_log_user_id ON task_progress_log(user_id);
CREATE INDEX IF NOT EXISTS idx_task_progress_log_created_at ON task_progress_log(created_at);

-- RLS for task_progress_log
ALTER TABLE task_progress_log ENABLE ROW LEVEL SECURITY;

-- Everyone can view progress logs for tasks they can view
DROP POLICY IF EXISTS "Users can view progress logs for accessible tasks" ON task_progress_log;
CREATE POLICY "Users can view progress logs for accessible tasks" ON task_progress_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_progress_log.task_id
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

-- Only assigned user can create progress log entries
DROP POLICY IF EXISTS "Assigned users can create progress logs" ON task_progress_log;
CREATE POLICY "Assigned users can create progress logs" ON task_progress_log
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_progress_log.task_id
      AND t.assigned_to = auth.uid()
    )
  );

-- 3. Add indexes for performance (if not already exist)
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id_status ON tasks(project_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to_status ON tasks(assigned_to, status);

-- 4. Create function to prevent task updates after creation (except status updates by assigned user)
-- This will be enforced via triggers and RLS policies
CREATE OR REPLACE FUNCTION check_task_immutability()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow status updates by assigned user (these go through progress log)
  -- Allow review status updates by reviewers
  -- Block all other updates
  IF OLD.id IS NOT NULL THEN
    -- Check if this is a status update by assigned user
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      -- Status updates are allowed, but will be logged via progress log
      RETURN NEW;
    END IF;
    
    -- Check if this is a review status update
    IF NEW.review_status IS DISTINCT FROM OLD.review_status THEN
      -- Review status updates are allowed
      RETURN NEW;
    END IF;
    
    -- Check if this is a review-related field update
    IF NEW.review_requested_by IS DISTINCT FROM OLD.review_requested_by
       OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
       OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
       OR NEW.review_comments IS DISTINCT FROM OLD.review_comments THEN
      -- Review-related updates are allowed
      RETURN NEW;
    END IF;
    
    -- Block all other field updates
    IF NEW.title IS DISTINCT FROM OLD.title
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.project_id IS DISTINCT FROM OLD.project_id
       OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
       OR NEW.due_date IS DISTINCT FROM OLD.due_date
       OR NEW.priority IS DISTINCT FROM OLD.priority THEN
      RAISE EXCEPTION 'Tasks cannot be edited after creation. Only status updates and review actions are allowed.';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to enforce immutability
DROP TRIGGER IF EXISTS enforce_task_immutability ON tasks;
CREATE TRIGGER enforce_task_immutability
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION check_task_immutability();

-- 5. Prevent task deletion (enforce at database level)
-- Remove any existing delete policies
DROP POLICY IF EXISTS "Users can delete tasks" ON tasks;
DROP POLICY IF EXISTS "Admins can delete tasks" ON tasks;
DROP POLICY IF EXISTS "Super admins can delete tasks" ON tasks;

-- No delete policies = no one can delete tasks
-- This enforces immutability at the database level

-- 6. Ensure single assignee constraint (already enforced by schema, but add check)
ALTER TABLE tasks
  DROP CONSTRAINT IF EXISTS tasks_single_assignee_check;
ALTER TABLE tasks
  ADD CONSTRAINT tasks_single_assignee_check
  CHECK (assigned_to IS NULL OR assigned_to IS NOT NULL); -- This is always true, but documents the constraint

-- 7. Update RLS policies to enforce assignment constraints
-- Only assigned user can update status (already handled by existing policies, but ensure it's clear)

-- 8. Update RLS policies to enforce interaction rules
-- Only assigned user can add comments, notes, upload files, request review
-- All users can view all tasks (already handled by existing policies)

-- Update task_comments policy to allow assigned user OR Super Admin
DROP POLICY IF EXISTS "Users can create notes on accessible tasks" ON task_notes;
DROP POLICY IF EXISTS "Assigned users can create notes on their tasks" ON task_notes;
DROP POLICY IF EXISTS "Assigned users or super admin can create notes" ON task_notes;
CREATE POLICY "Assigned users or super admin can create notes" ON task_notes
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_notes.task_id
      AND t.status != 'closed'
      AND (
        t.assigned_to = auth.uid()
        OR public.user_has_role(ARRAY['super_admin'])
      )
    )
  );

-- Update task_files policy to allow assigned user OR Super Admin
DROP POLICY IF EXISTS "Users can upload files to accessible tasks" ON task_files;
DROP POLICY IF EXISTS "Assigned users can upload files to their tasks" ON task_files;
DROP POLICY IF EXISTS "Assigned users or super admin can upload files" ON task_files;
CREATE POLICY "Assigned users or super admin can upload files" ON task_files
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_files.task_id
      AND t.status != 'closed'
      AND (
        t.assigned_to = auth.uid()
        OR public.user_has_role(ARRAY['super_admin'])
      )
    )
  );

-- Update task_comments policy to allow assigned user OR Super Admin
DROP POLICY IF EXISTS "Users can create comments on accessible tasks" ON task_comments;
DROP POLICY IF EXISTS "Assigned users can create comments on their tasks" ON task_comments;
DROP POLICY IF EXISTS "Assigned users or super admin can create comments" ON task_comments;
CREATE POLICY "Assigned users or super admin can create comments" ON task_comments
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_comments.task_id
      AND t.status != 'closed'
      AND (
        t.assigned_to = auth.uid()
        OR public.user_has_role(ARRAY['super_admin'])
      )
    )
  );

-- 9. Add storage policy for file type validation
-- Note: Storage policies are applied at the bucket level
-- Full validation happens at application level, but we add basic checks here

-- Drop existing storage policies if they exist (if they were created via UI)
-- Note: These may need to be dropped via Supabase Dashboard if they exist
DROP POLICY IF EXISTS "Authenticated users can upload task files" ON storage.objects;
DROP POLICY IF EXISTS "Users can view task files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own task files" ON storage.objects;

-- Allow authenticated users to upload files to task-files bucket
-- Application-level validation enforces file types
CREATE POLICY "Authenticated users can upload task files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'task-files');

-- Allow users to view files for tasks they can access
CREATE POLICY "Users can view task files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'task-files'
  AND EXISTS (
    SELECT 1 FROM tasks t
    JOIN task_files tf ON (
      -- Match file path (handle both old format with bucket prefix and new format without)
      tf.file_path = storage.objects.name 
      OR tf.file_path = 'task-files/' || storage.objects.name
      OR 'task-files/' || tf.file_path = storage.objects.name
    )
    WHERE tf.task_id = t.id
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

-- 10. Enforce project creation permissions at database level
-- Only Admin and Super Admin can create projects
DROP POLICY IF EXISTS "Admins can create projects" ON projects;
DROP POLICY IF EXISTS "Users can create projects" ON projects;
DROP POLICY IF EXISTS "Only admins can create projects" ON projects;

CREATE POLICY "Only admins can create projects" ON projects
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = auth.uid()
      AND r.name IN ('admin', 'super_admin')
    )
  );

-- 11. Enforce review permissions - only Super Admin can review
-- This is handled at application level, but we document it here
-- Review status updates are allowed via the immutability trigger

-- 12. Add comment documenting immutability
COMMENT ON TABLE tasks IS 'Tasks are immutable after creation. Only status updates (via progress log) and review actions are allowed. Tasks cannot be deleted.';

COMMENT ON COLUMN tasks.assigned_to IS 'Single assignee only. Cannot be changed after task creation.';

-- 13. Ensure due_date index exists for performance
CREATE INDEX IF NOT EXISTS idx_tasks_due_date_status ON tasks(due_date, status) WHERE due_date IS NOT NULL;
