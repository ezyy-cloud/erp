-- Migration 035: Canonical Task Lifecycle
-- Implements strict single-source-of-truth task lifecycle model
-- Replaces ambiguous status/review_status fields with single authoritative task_status
-- Enforces state transitions at database level

-- ============================================
-- 1. Add new canonical task_status column
-- ============================================
-- First, add the new column as nullable to allow migration
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS task_status VARCHAR(50) DEFAULT 'ToDo';

-- ============================================
-- 2. Map existing tasks to canonical lifecycle
-- ============================================
-- Migration logic:
-- - archived_at IS NOT NULL -> 'Closed'
-- - status = 'done' AND review_status = 'pending_review' -> 'Done'
-- - status = 'done' AND review_status = 'under_review' -> 'Done'
-- - status = 'done' AND review_status = 'reviewed_approved' -> 'Closed' (should have archived_at, but handle edge cases)
-- - status = 'done' AND review_status = 'changes_requested' -> 'Work-In-Progress'
-- - status = 'in_progress' -> 'Work-In-Progress'
-- - status = 'to_do' -> 'ToDo'
-- - status = 'blocked' -> 'Work-In-Progress' (blocked is not a lifecycle state, it's a condition)
-- - status = 'closed' -> 'Closed'
-- - Everything else -> 'ToDo' (safe default)

UPDATE tasks
SET task_status = CASE
  -- Closed: Archived tasks are always Closed
  WHEN archived_at IS NOT NULL THEN 'Closed'
  -- Closed: Done and approved (even if not archived, fix data inconsistency)
  WHEN status = 'done' AND review_status = 'reviewed_approved' THEN 'Closed'
  -- Done: Pending review
  WHEN status = 'done' AND review_status IN ('pending_review', 'under_review') THEN 'Done'
  -- Work-In-Progress: Active work or changes requested
  WHEN status = 'in_progress' THEN 'Work-In-Progress'
  WHEN status = 'done' AND review_status = 'changes_requested' THEN 'Work-In-Progress'
  WHEN status = 'blocked' THEN 'Work-In-Progress' -- Blocked is a condition, not a state
  -- Closed: Explicitly closed
  WHEN status = 'closed' THEN 'Closed'
  -- ToDo: Default for new/unstarted tasks
  WHEN status = 'to_do' THEN 'ToDo'
  -- Safe default
  ELSE 'ToDo'
END
WHERE task_status IS NULL;

-- Fix: Update tasks that are 'done' but don't have review_status set properly
-- These should be in 'Done' status (pending review) since they're already marked as done
-- Temporarily disable the trigger if it exists (in case migration was partially run)
DO $$
BEGIN
  -- Disable trigger if it exists
  IF EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'enforce_task_lifecycle_transitions_trigger'
  ) THEN
    ALTER TABLE tasks DISABLE TRIGGER enforce_task_lifecycle_transitions_trigger;
  END IF;
END $$;

UPDATE tasks
SET task_status = 'Done'
WHERE status = 'done' 
  AND task_status != 'Done'
  AND task_status != 'Closed'
  AND archived_at IS NULL
  AND deleted_at IS NULL;

-- Re-enable the trigger if it was disabled
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'enforce_task_lifecycle_transitions_trigger'
  ) THEN
    ALTER TABLE tasks ENABLE TRIGGER enforce_task_lifecycle_transitions_trigger;
  END IF;
END $$;

-- ============================================
-- 3. Make task_status NOT NULL and add constraint
-- ============================================
-- Drop constraint if it exists (in case migration was partially run)
ALTER TABLE tasks
  DROP CONSTRAINT IF EXISTS tasks_task_status_check;

-- Set NOT NULL (only if column is nullable)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tasks' 
    AND column_name = 'task_status' 
    AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE tasks ALTER COLUMN task_status SET NOT NULL;
  END IF;
END $$;

-- Add constraint
ALTER TABLE tasks
  ADD CONSTRAINT tasks_task_status_check 
  CHECK (task_status IN ('ToDo', 'Work-In-Progress', 'Done', 'Closed'));

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_tasks_task_status ON tasks(task_status);
CREATE INDEX IF NOT EXISTS idx_tasks_task_status_archived ON tasks(task_status, archived_at) WHERE archived_at IS NOT NULL;

-- Add comment
COMMENT ON COLUMN tasks.task_status IS 'Canonical task lifecycle state: ToDo, Work-In-Progress, Done (Pending Review), Closed (Complete - Passed Review)';

-- ============================================
-- 4. Create state transition enforcement function
-- ============================================
CREATE OR REPLACE FUNCTION public.validate_task_status_transition(
  p_old_status VARCHAR(50),
  p_new_status VARCHAR(50),
  p_user_role VARCHAR(50)
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Super Admin can reopen Closed tasks
  IF p_old_status = 'Closed' AND p_new_status = 'Work-In-Progress' THEN
    RETURN p_user_role = 'super_admin';
  END IF;

  -- Standard transitions (allowed for all users)
  IF p_old_status = 'ToDo' AND p_new_status = 'Work-In-Progress' THEN
    RETURN true;
  END IF;

  IF p_old_status = 'Work-In-Progress' AND p_new_status = 'Done' THEN
    RETURN true;
  END IF;

  IF p_old_status = 'Done' AND p_new_status = 'Closed' THEN
    RETURN p_user_role = 'super_admin'; -- Only Super Admin can approve
  END IF;

  -- No other transitions allowed
  RETURN false;
END;
$$;

-- ============================================
-- 5. Create trigger to enforce state transitions
-- ============================================
CREATE OR REPLACE FUNCTION enforce_task_lifecycle_transitions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_role VARCHAR(50);
  v_transition_allowed BOOLEAN;
BEGIN
  -- Only enforce if task_status is being changed
  IF OLD.task_status IS DISTINCT FROM NEW.task_status THEN
    -- Get user role
    SELECT r.name INTO v_user_role
    FROM users u
    JOIN roles r ON u.role_id = r.id
    WHERE u.id = auth.uid();

    -- Validate transition
    v_transition_allowed := public.validate_task_status_transition(
      OLD.task_status,
      NEW.task_status,
      COALESCE(v_user_role, 'user')
    );

    IF NOT v_transition_allowed THEN
      RAISE EXCEPTION 'Invalid task status transition from % to %. Only allowed transitions: ToDo->Work-In-Progress, Work-In-Progress->Done, Done->Closed (Super Admin only), Closed->Work-In-Progress (Super Admin only)',
        OLD.task_status, NEW.task_status;
    END IF;

    -- Enforce lifecycle rules
    -- 1. Closed tasks must have archived_at set
    IF NEW.task_status = 'Closed' AND NEW.archived_at IS NULL THEN
      NEW.archived_at := NOW();
      NEW.archived_by := auth.uid();
    END IF;

    -- 2. Non-Closed tasks must not have archived_at
    IF NEW.task_status != 'Closed' AND NEW.archived_at IS NOT NULL THEN
      NEW.archived_at := NULL;
      NEW.archived_by := NULL;
    END IF;

    -- 3. Done status requires review_requested_at
    IF NEW.task_status = 'Done' AND NEW.review_requested_at IS NULL THEN
      NEW.review_requested_at := NOW();
      NEW.review_requested_by := auth.uid();
    END IF;

    -- 4. Closed status requires reviewed_at
    IF NEW.task_status = 'Closed' AND NEW.reviewed_at IS NULL THEN
      NEW.reviewed_at := NOW();
      NEW.reviewed_by := auth.uid();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS enforce_task_lifecycle_transitions_trigger ON tasks;
CREATE TRIGGER enforce_task_lifecycle_transitions_trigger
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION enforce_task_lifecycle_transitions();

-- ============================================
-- 6. Create function to transition ToDo -> Work-In-Progress
-- ============================================
-- This is triggered automatically when assigned user adds comment, note, or file
CREATE OR REPLACE FUNCTION public.transition_to_work_in_progress(
  p_task_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task tasks;
  v_is_assigned BOOLEAN;
BEGIN
  -- Get task
  SELECT * INTO v_task
  FROM tasks
  WHERE id = p_task_id
  AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Task not found or deleted'
    );
  END IF;

  -- Check if user is assigned
  SELECT EXISTS (
    SELECT 1 FROM task_assignees ta
    WHERE ta.task_id = p_task_id
    AND ta.user_id = p_user_id
  ) OR v_task.assigned_to = p_user_id INTO v_is_assigned;

  IF NOT v_is_assigned THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Only assigned users can start work on tasks'
    );
  END IF;

  -- Only transition if currently ToDo
  IF v_task.task_status != 'ToDo' THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Task is already in progress or beyond'
    );
  END IF;

  -- Transition to Work-In-Progress
  UPDATE tasks
  SET
    task_status = 'Work-In-Progress',
    updated_at = NOW()
  WHERE id = p_task_id;

  -- Log progress
  INSERT INTO task_progress_log (task_id, user_id, status, progress_note, created_by)
  VALUES (p_task_id, p_user_id, 'Work-In-Progress', 'Work started - first user interaction', p_user_id);

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Task moved to Work-In-Progress'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- ============================================
-- 7. Update mark_task_done_pending_review to use new lifecycle
-- ============================================
CREATE OR REPLACE FUNCTION public.mark_task_done_pending_review(
  p_task_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task tasks;
  v_is_assigned BOOLEAN;
BEGIN
  -- Get task
  SELECT * INTO v_task
  FROM tasks
  WHERE id = p_task_id
  AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Task not found or deleted'
    );
  END IF;

  -- Check if task is Closed
  IF v_task.task_status = 'Closed' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot modify Closed task'
    );
  END IF;

  -- Check if user is assigned
  SELECT EXISTS (
    SELECT 1 FROM task_assignees ta
    WHERE ta.task_id = p_task_id
    AND ta.user_id = p_user_id
  ) OR v_task.assigned_to = p_user_id INTO v_is_assigned;

  IF NOT v_is_assigned THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Only assigned users can request review'
    );
  END IF;

  -- Only allow transition from Work-In-Progress
  IF v_task.task_status != 'Work-In-Progress' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Can only request review for tasks in Work-In-Progress state'
    );
  END IF;

  -- Update task: set task_status to 'Done'
  UPDATE tasks
  SET
    task_status = 'Done',
    review_requested_by = p_user_id,
    review_requested_at = NOW(),
    updated_at = NOW()
  WHERE id = p_task_id;

  -- Log progress
  INSERT INTO task_progress_log (task_id, user_id, status, progress_note, created_by)
  VALUES (p_task_id, p_user_id, 'Done', 'Review requested', p_user_id);

  -- Trigger notification
  PERFORM public.create_review_requested_notification(p_task_id, p_user_id);

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Task marked as Done - pending review'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- ============================================
-- 8. Update approve_and_archive_task to use new lifecycle
-- ============================================
CREATE OR REPLACE FUNCTION public.approve_and_archive_task(
  p_task_id UUID,
  p_user_id UUID,
  p_comments TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task tasks;
BEGIN
  -- Validate that user is Super Admin
  IF NOT public.user_has_role(ARRAY['super_admin']) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Only Super Admin can approve and close tasks'
    );
  END IF;

  -- Get task
  SELECT * INTO v_task
  FROM tasks
  WHERE id = p_task_id
  AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Task not found or deleted'
    );
  END IF;

  -- Check if already Closed
  IF v_task.task_status = 'Closed' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Task is already Closed'
    );
  END IF;

  -- Only allow transition from Done
  IF v_task.task_status != 'Done' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Can only approve tasks in Done (Pending Review) state'
    );
  END IF;

  -- Approve and close in one operation
  UPDATE tasks
  SET
    task_status = 'Closed',
    reviewed_by = p_user_id,
    reviewed_at = NOW(),
    review_comments = p_comments,
    archived_at = NOW(),
    archived_by = p_user_id,
    updated_at = NOW()
  WHERE id = p_task_id;

  -- Log progress
  INSERT INTO task_progress_log (task_id, user_id, status, progress_note, created_by)
  VALUES (p_task_id, p_user_id, 'Closed', 'Task approved and closed', p_user_id);

  -- Trigger notification
  PERFORM public.create_review_completed_notification(p_task_id, p_user_id, 'reviewed_approved');

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Task approved and closed successfully'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- ============================================
-- 9. Update reject_review_and_reopen to use new lifecycle
-- ============================================
CREATE OR REPLACE FUNCTION public.reject_review_and_reopen(
  p_task_id UUID,
  p_user_id UUID,
  p_comments TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task tasks;
BEGIN
  -- Validate that user is Super Admin
  IF NOT public.user_has_role(ARRAY['super_admin']) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Only Super Admin can reject reviews'
    );
  END IF;

  -- Get task
  SELECT * INTO v_task
  FROM tasks
  WHERE id = p_task_id
  AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Task not found or deleted'
    );
  END IF;

  -- Only allow rejection from Done state
  IF v_task.task_status != 'Done' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Can only reject reviews for tasks in Done (Pending Review) state'
    );
  END IF;

  -- Reject review and return to Work-In-Progress
  UPDATE tasks
  SET
    task_status = 'Work-In-Progress',
    reviewed_by = p_user_id,
    reviewed_at = NOW(),
    review_comments = p_comments,
    review_requested_at = NULL,
    review_requested_by = NULL,
    updated_at = NOW()
  WHERE id = p_task_id;

  -- Log progress
  INSERT INTO task_progress_log (task_id, user_id, status, progress_note, created_by)
  VALUES (p_task_id, p_user_id, 'Work-In-Progress', 'Review rejected - returned to Work-In-Progress', p_user_id);

  -- Trigger notification
  PERFORM public.create_review_completed_notification(p_task_id, p_user_id, 'changes_requested');

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Review rejected and task returned to Work-In-Progress'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- ============================================
-- 10. Update unarchive_task to use new lifecycle
-- ============================================
-- Drop the old function with 3 parameters first
DROP FUNCTION IF EXISTS public.unarchive_task(UUID, UUID, VARCHAR);

-- Create the new function with 2 parameters
CREATE OR REPLACE FUNCTION public.unarchive_task(
  p_task_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task tasks;
BEGIN
  -- Validate that user is Super Admin
  IF NOT public.user_has_role(ARRAY['super_admin']) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Only Super Admin can reopen Closed tasks'
    );
  END IF;

  -- Get task
  SELECT * INTO v_task
  FROM tasks
  WHERE id = p_task_id
  AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Task not found or deleted'
    );
  END IF;

  -- Check if task is Closed
  IF v_task.task_status != 'Closed' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Task is not Closed'
    );
  END IF;

  -- Reopen: transition Closed -> Work-In-Progress
  UPDATE tasks
  SET
    task_status = 'Work-In-Progress',
    archived_at = NULL,
    archived_by = NULL,
    reviewed_by = NULL,
    reviewed_at = NULL,
    review_comments = NULL,
    review_requested_at = NULL,
    review_requested_by = NULL,
    updated_at = NOW()
  WHERE id = p_task_id;

  -- Log progress
  INSERT INTO task_progress_log (task_id, user_id, status, progress_note, created_by)
  VALUES (p_task_id, p_user_id, 'Work-In-Progress', 'Task reopened (unarchived)', p_user_id);

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Task reopened successfully'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- ============================================
-- 11. Create triggers to auto-transition on user interaction
-- ============================================
-- When assigned user adds comment, note, or file, auto-transition ToDo -> Work-In-Progress
CREATE OR REPLACE FUNCTION auto_transition_on_user_interaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task tasks;
  v_is_assigned BOOLEAN;
BEGIN
  -- Get the task
  SELECT * INTO v_task
  FROM tasks
  WHERE id = NEW.task_id
  AND deleted_at IS NULL;

  IF FOUND THEN
    -- Check if user is assigned
    SELECT EXISTS (
      SELECT 1 FROM task_assignees ta
      WHERE ta.task_id = NEW.task_id
      AND ta.user_id = NEW.user_id
    ) OR v_task.assigned_to = NEW.user_id INTO v_is_assigned;

    -- If task is ToDo and user is assigned, transition to Work-In-Progress
    IF v_task.task_status = 'ToDo' AND v_is_assigned THEN
      UPDATE tasks
      SET task_status = 'Work-In-Progress', updated_at = NOW()
      WHERE id = NEW.task_id
      AND task_status = 'ToDo'; -- Double-check to avoid race conditions

      -- Log progress
      INSERT INTO task_progress_log (task_id, user_id, status, progress_note, created_by)
      VALUES (NEW.task_id, NEW.user_id, 'Work-In-Progress', 'Work started - first user interaction', NEW.user_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create triggers for comments, notes, and files
DROP TRIGGER IF EXISTS auto_transition_on_comment ON task_comments;
CREATE TRIGGER auto_transition_on_comment
  AFTER INSERT ON task_comments
  FOR EACH ROW
  EXECUTE FUNCTION auto_transition_on_user_interaction();

DROP TRIGGER IF EXISTS auto_transition_on_note ON task_notes;
CREATE TRIGGER auto_transition_on_note
  AFTER INSERT ON task_notes
  FOR EACH ROW
  EXECUTE FUNCTION auto_transition_on_user_interaction();

DROP TRIGGER IF EXISTS auto_transition_on_file ON task_files;
CREATE TRIGGER auto_transition_on_file
  AFTER INSERT ON task_files
  FOR EACH ROW
  EXECUTE FUNCTION auto_transition_on_user_interaction();

-- ============================================
-- 11b. Fix existing tasks with comments/notes/files that should be Work-In-Progress
-- ============================================
-- Update tasks that have comments, notes, or files from assigned users but are still in ToDo
-- Temporarily disable the trigger to allow bulk update
DO $$
BEGIN
  -- Disable trigger if it exists
  IF EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'enforce_task_lifecycle_transitions_trigger'
  ) THEN
    ALTER TABLE tasks DISABLE TRIGGER enforce_task_lifecycle_transitions_trigger;
  END IF;
END $$;

-- Update tasks that have comments, notes, or files from assigned users
UPDATE tasks t
SET task_status = 'Work-In-Progress', updated_at = NOW()
WHERE t.deleted_at IS NULL
  AND t.task_status = 'ToDo'
  AND (
    -- Has comments from assigned user
    EXISTS (
      SELECT 1 FROM task_comments tc
      WHERE tc.task_id = t.id
      AND (
        tc.user_id = t.assigned_to
        OR EXISTS (
          SELECT 1 FROM task_assignees ta
          WHERE ta.task_id = t.id AND ta.user_id = tc.user_id
        )
      )
    )
    -- Has notes from assigned user
    OR EXISTS (
      SELECT 1 FROM task_notes tn
      WHERE tn.task_id = t.id
      AND (
        tn.user_id = t.assigned_to
        OR EXISTS (
          SELECT 1 FROM task_assignees ta
          WHERE ta.task_id = t.id AND ta.user_id = tn.user_id
        )
      )
    )
    -- Has files from assigned user
    OR EXISTS (
      SELECT 1 FROM task_files tf
      WHERE tf.task_id = t.id
      AND (
        tf.user_id = t.assigned_to
        OR EXISTS (
          SELECT 1 FROM task_assignees ta
          WHERE ta.task_id = t.id AND ta.user_id = tf.user_id
        )
      )
    )
  );

-- Re-enable the trigger
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'enforce_task_lifecycle_transitions_trigger'
  ) THEN
    ALTER TABLE tasks ENABLE TRIGGER enforce_task_lifecycle_transitions_trigger;
  END IF;
END $$;

-- Note: Progress logging for these updated tasks will happen automatically
-- when users interact with them going forward via the triggers

-- ============================================
-- 11c. Fix tasks with old status='in_progress' that should be Work-In-Progress
-- ============================================
-- Update tasks that have status='in_progress' but task_status is not 'Work-In-Progress'
-- Temporarily disable the trigger to allow bulk update
DO $$
BEGIN
  -- Disable trigger if it exists
  IF EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'enforce_task_lifecycle_transitions_trigger'
  ) THEN
    ALTER TABLE tasks DISABLE TRIGGER enforce_task_lifecycle_transitions_trigger;
  END IF;
END $$;

-- Update tasks with status='in_progress' to have task_status='Work-In-Progress'
UPDATE tasks t
SET task_status = 'Work-In-Progress', updated_at = NOW()
WHERE t.deleted_at IS NULL
  AND t.status = 'in_progress'
  AND t.task_status != 'Work-In-Progress'
  AND t.task_status != 'Closed'
  AND t.task_status != 'Done';

-- Also update tasks with status='blocked' to Work-In-Progress (blocked is a condition, not a state)
UPDATE tasks t
SET task_status = 'Work-In-Progress', updated_at = NOW()
WHERE t.deleted_at IS NULL
  AND t.status = 'blocked'
  AND t.task_status != 'Work-In-Progress'
  AND t.task_status != 'Closed'
  AND t.task_status != 'Done';

-- Re-enable the trigger
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'enforce_task_lifecycle_transitions_trigger'
  ) THEN
    ALTER TABLE tasks ENABLE TRIGGER enforce_task_lifecycle_transitions_trigger;
  END IF;
END $$;

-- ============================================
-- 12. Update RLS policies to check task_status instead of status
-- ============================================
-- Update policies that check for closed tasks
-- Note: Most policies will continue to work, but we update key ones

-- Update task_comments policy to check task_status
DROP POLICY IF EXISTS "Assigned users or super admin can create comments" ON task_comments;
CREATE POLICY "Assigned users or super admin can create comments" ON task_comments
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_comments.task_id
      AND t.task_status != 'Closed'
      AND (
        EXISTS (
          SELECT 1 FROM task_assignees ta
          WHERE ta.task_id = t.id
          AND ta.user_id = auth.uid()
        )
        OR t.assigned_to = auth.uid()
        OR public.user_has_role(ARRAY['super_admin'])
      )
    )
  );

-- Update task_notes policy
DROP POLICY IF EXISTS "Assigned users or super admin can create notes" ON task_notes;
CREATE POLICY "Assigned users or super admin can create notes" ON task_notes
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_notes.task_id
      AND t.task_status != 'Closed'
      AND (
        EXISTS (
          SELECT 1 FROM task_assignees ta
          WHERE ta.task_id = t.id
          AND ta.user_id = auth.uid()
        )
        OR t.assigned_to = auth.uid()
        OR public.user_has_role(ARRAY['super_admin'])
      )
    )
  );

-- Update task_files policy
DROP POLICY IF EXISTS "Assigned users or super admin can upload files" ON task_files;
CREATE POLICY "Assigned users or super admin can upload files" ON task_files
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_files.task_id
      AND t.task_status != 'Closed'
      AND (
        EXISTS (
          SELECT 1 FROM task_assignees ta
          WHERE ta.task_id = t.id
          AND ta.user_id = auth.uid()
        )
        OR t.assigned_to = auth.uid()
        OR public.user_has_role(ARRAY['super_admin'])
      )
    )
  );

-- ============================================
-- 13. Grant execute permissions
-- ============================================
GRANT EXECUTE ON FUNCTION public.transition_to_work_in_progress(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_task_done_pending_review(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_and_archive_task(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_review_and_reopen(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unarchive_task(UUID, UUID) TO authenticated;

-- ============================================
-- 14. Add comments for documentation
-- ============================================
COMMENT ON FUNCTION transition_to_work_in_progress IS 'Automatically transitions task from ToDo to Work-In-Progress when assigned user interacts (called by triggers)';
COMMENT ON FUNCTION mark_task_done_pending_review IS 'Transitions task from Work-In-Progress to Done (Pending Review). Only assigned users can request review.';
COMMENT ON FUNCTION approve_and_archive_task IS 'Transitions task from Done to Closed. Only Super Admin can approve reviews.';
COMMENT ON FUNCTION reject_review_and_reopen IS 'Rejects review and returns task from Done to Work-In-Progress. Only Super Admin can reject reviews.';
COMMENT ON FUNCTION unarchive_task IS 'Reopens Closed task, transitioning from Closed to Work-In-Progress. Only Super Admin can reopen tasks.';

-- ============================================
-- 15. Update dashboard functions to use task_status
-- ============================================
-- Drop existing functions first (they may have different return types from migration 022)
-- Migration 022 changed return type to TABLE, but we need JSON to match migration 010
-- We must drop first because PostgreSQL doesn't allow changing return types with CREATE OR REPLACE
-- Use CASCADE to handle any dependencies
DROP FUNCTION IF EXISTS get_dashboard_stats_super_admin(UUID) CASCADE;
DROP FUNCTION IF EXISTS get_dashboard_stats_admin(UUID) CASCADE;
DROP FUNCTION IF EXISTS get_dashboard_stats_staff(UUID) CASCADE;
DROP FUNCTION IF EXISTS get_user_workload_summary(UUID) CASCADE;

-- Update get_dashboard_stats_super_admin to count Done tasks
CREATE OR REPLACE FUNCTION get_dashboard_stats_super_admin(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
  v_total_projects INTEGER;
  v_total_tasks INTEGER;
  v_tasks_due_today INTEGER;
  v_overdue_tasks INTEGER;
  v_tasks_awaiting_review INTEGER;
  v_status_distribution JSON;
BEGIN
  -- Verify user is super_admin
  IF NOT EXISTS (
    SELECT 1 FROM users u
    JOIN roles r ON u.role_id = r.id
    WHERE u.id = p_user_id AND r.name = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'User is not a super admin';
  END IF;
  
  -- Total projects
  SELECT COUNT(*) INTO v_total_projects
  FROM projects;
  
  -- Total tasks
  SELECT COUNT(*) INTO v_total_tasks
  FROM tasks
  WHERE deleted_at IS NULL;
  
  -- Tasks due today (exclude Closed)
  SELECT COUNT(*) INTO v_tasks_due_today
  FROM tasks
  WHERE deleted_at IS NULL
    AND due_date IS NOT NULL
    AND DATE(due_date) = CURRENT_DATE
    AND task_status != 'Closed';
  
  -- Overdue tasks (exclude Closed)
  SELECT COUNT(*) INTO v_overdue_tasks
  FROM tasks
  WHERE deleted_at IS NULL
    AND due_date IS NOT NULL
    AND due_date < NOW()
    AND task_status != 'Closed';
  
  -- Tasks awaiting review (Done status = pending review)
  SELECT COUNT(*) INTO v_tasks_awaiting_review
  FROM tasks
  WHERE deleted_at IS NULL
    AND task_status = 'Done';
  
  -- Task status distribution (using task_status)
  SELECT json_agg(
    json_build_object(
      'status', task_status,
      'count', count
    )
  ) INTO v_status_distribution
  FROM (
    SELECT task_status, COUNT(*) as count
    FROM tasks
    WHERE deleted_at IS NULL
    GROUP BY task_status
  ) status_counts;
  
  -- Build result
  v_result := json_build_object(
    'total_projects', v_total_projects,
    'total_tasks', v_total_tasks,
    'tasks_due_today', v_tasks_due_today,
    'overdue_tasks', v_overdue_tasks,
    'tasks_awaiting_review', v_tasks_awaiting_review,
    'task_status_distribution', COALESCE(v_status_distribution, '[]'::json)
  );
  
  RETURN v_result;
END;
$$;

-- Update get_dashboard_stats_admin to count Done tasks
CREATE OR REPLACE FUNCTION get_dashboard_stats_admin(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
  v_active_projects INTEGER;
  v_tasks_due_today INTEGER;
  v_overdue_tasks INTEGER;
  v_tasks_awaiting_review INTEGER;
  v_recently_updated_tasks JSON;
BEGIN
  -- Verify user is admin
  IF NOT EXISTS (
    SELECT 1 FROM users u
    JOIN roles r ON u.role_id = r.id
    WHERE u.id = p_user_id AND r.name = 'admin'
  ) THEN
    RAISE EXCEPTION 'User is not an admin';
  END IF;
  
  -- Active projects
  SELECT COUNT(*) INTO v_active_projects
  FROM projects
  WHERE status = 'active';
  
  -- Tasks due today (exclude Closed)
  SELECT COUNT(*) INTO v_tasks_due_today
  FROM tasks
  WHERE deleted_at IS NULL
    AND due_date IS NOT NULL
    AND DATE(due_date) = CURRENT_DATE
    AND task_status != 'Closed';
  
  -- Overdue tasks (exclude Closed)
  SELECT COUNT(*) INTO v_overdue_tasks
  FROM tasks
  WHERE deleted_at IS NULL
    AND due_date IS NOT NULL
    AND due_date < NOW()
    AND task_status != 'Closed';
  
  -- Tasks awaiting review (Done status = pending review)
  SELECT COUNT(*) INTO v_tasks_awaiting_review
  FROM tasks
  WHERE deleted_at IS NULL
    AND task_status = 'Done';
  
  -- Recently updated tasks (last 10)
  SELECT json_agg(
    json_build_object(
      'id', id,
      'title', title,
      'status', task_status,
      'updated_at', updated_at
    )
    ORDER BY updated_at DESC
  ) INTO v_recently_updated_tasks
  FROM (
    SELECT id, title, task_status, updated_at
    FROM tasks
    WHERE deleted_at IS NULL
    ORDER BY updated_at DESC
    LIMIT 10
  ) recent_tasks;
  
  -- Build result
  v_result := json_build_object(
    'active_projects', v_active_projects,
    'tasks_due_today', v_tasks_due_today,
    'overdue_tasks', v_overdue_tasks,
    'tasks_awaiting_review', v_tasks_awaiting_review,
    'recently_updated_tasks', COALESCE(v_recently_updated_tasks, '[]'::json)
  );
  
  RETURN v_result;
END;
$$;

-- Update get_dashboard_stats_staff to count Done tasks
CREATE OR REPLACE FUNCTION get_dashboard_stats_staff(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
  v_my_tasks INTEGER;
  v_tasks_due_today INTEGER;
  v_overdue_tasks INTEGER;
  v_tasks_awaiting_action INTEGER;
  v_tasks_submitted_for_review INTEGER;
BEGIN
  -- Verify user exists
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User does not exist';
  END IF;
  
  -- My tasks (assigned to me via task_assignees or legacy assigned_to)
  SELECT COUNT(DISTINCT t.id) INTO v_my_tasks
  FROM tasks t
  WHERE t.deleted_at IS NULL
    AND (
      EXISTS (
        SELECT 1 FROM task_assignees ta
        WHERE ta.task_id = t.id
        AND ta.user_id = p_user_id
      )
      OR t.assigned_to = p_user_id
    );
  
  -- Tasks due today (assigned to me, exclude Closed)
  SELECT COUNT(DISTINCT t.id) INTO v_tasks_due_today
  FROM tasks t
  WHERE t.deleted_at IS NULL
    AND t.due_date IS NOT NULL
    AND DATE(t.due_date) = CURRENT_DATE
    AND t.task_status != 'Closed'
    AND (
      EXISTS (
        SELECT 1 FROM task_assignees ta
        WHERE ta.task_id = t.id
        AND ta.user_id = p_user_id
      )
      OR t.assigned_to = p_user_id
    );
  
  -- Overdue tasks (assigned to me, exclude Closed)
  SELECT COUNT(DISTINCT t.id) INTO v_overdue_tasks
  FROM tasks t
  WHERE t.deleted_at IS NULL
    AND t.due_date IS NOT NULL
    AND t.due_date < NOW()
    AND t.task_status != 'Closed'
    AND (
      EXISTS (
        SELECT 1 FROM task_assignees ta
        WHERE ta.task_id = t.id
        AND ta.user_id = p_user_id
      )
      OR t.assigned_to = p_user_id
    );
  
  -- Tasks awaiting my action (assigned to me, not Closed)
  SELECT COUNT(DISTINCT t.id) INTO v_tasks_awaiting_action
  FROM tasks t
  WHERE t.deleted_at IS NULL
    AND t.task_status != 'Closed'
    AND (
      EXISTS (
        SELECT 1 FROM task_assignees ta
        WHERE ta.task_id = t.id
        AND ta.user_id = p_user_id
      )
      OR t.assigned_to = p_user_id
    );
  
  -- Tasks I submitted for review (Done status)
  SELECT COUNT(*) INTO v_tasks_submitted_for_review
  FROM tasks
  WHERE deleted_at IS NULL
    AND review_requested_by = p_user_id
    AND task_status = 'Done';
  
  -- Build result
  v_result := json_build_object(
    'my_tasks', v_my_tasks,
    'tasks_due_today', v_tasks_due_today,
    'overdue_tasks', v_overdue_tasks,
    'tasks_awaiting_action', v_tasks_awaiting_action,
    'tasks_submitted_for_review', v_tasks_submitted_for_review
  );
  
  RETURN v_result;
END;
$$;

-- Update get_user_workload_summary to use task_status
CREATE OR REPLACE FUNCTION get_user_workload_summary(p_user_id UUID)
RETURNS TABLE (
  user_id UUID,
  user_name VARCHAR,
  user_email VARCHAR,
  user_role VARCHAR,
  assigned_tasks INTEGER,
  overdue_tasks INTEGER,
  tasks_waiting_review INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Super Admin and Admin see all users
  IF EXISTS (
    SELECT 1 FROM users u
    JOIN roles r ON u.role_id = r.id
    WHERE u.id = p_user_id AND r.name IN ('super_admin', 'admin')
  ) THEN
    RETURN QUERY
    SELECT 
      u.id as user_id,
      COALESCE(u.full_name, u.email) as user_name,
      u.email as user_email,
      r.name as user_role,
      COUNT(DISTINCT t.id) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM task_assignees ta
          WHERE ta.task_id = t.id AND ta.user_id = u.id
        ) OR t.assigned_to = u.id
      )::INTEGER as assigned_tasks,
      COUNT(DISTINCT t.id) FILTER (
        WHERE t.due_date IS NOT NULL 
        AND t.due_date < NOW() 
        AND t.task_status != 'Closed'
        AND (EXISTS (
          SELECT 1 FROM task_assignees ta
          WHERE ta.task_id = t.id AND ta.user_id = u.id
        ) OR t.assigned_to = u.id)
      )::INTEGER as overdue_tasks,
      COUNT(DISTINCT t.id) FILTER (
        WHERE t.task_status = 'Done'
        AND t.deleted_at IS NULL
        AND (
          EXISTS (
            SELECT 1 FROM task_assignees ta
            WHERE ta.task_id = t.id AND ta.user_id = u.id
          )
          OR t.assigned_to = u.id
        )
      )::INTEGER as tasks_waiting_review
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id
    LEFT JOIN tasks t ON (
      EXISTS (
        SELECT 1 FROM task_assignees ta
        WHERE ta.task_id = t.id AND ta.user_id = u.id
      )
      OR t.assigned_to = u.id
      OR t.review_requested_by = u.id
    )
    WHERE u.is_active = true
      AND (t.deleted_at IS NULL OR t.id IS NULL)
    GROUP BY u.id, u.full_name, u.email, r.name
    ORDER BY u.full_name, u.email;
  -- Users see only themselves
  ELSE
    RETURN QUERY
    SELECT 
      u.id as user_id,
      COALESCE(u.full_name, u.email) as user_name,
      u.email as user_email,
      r.name as user_role,
      COUNT(DISTINCT t.id) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM task_assignees ta
          WHERE ta.task_id = t.id AND ta.user_id = u.id
        ) OR t.assigned_to = u.id
      )::INTEGER as assigned_tasks,
      COUNT(DISTINCT t.id) FILTER (
        WHERE t.due_date IS NOT NULL 
        AND t.due_date < NOW() 
        AND t.task_status != 'Closed'
        AND (EXISTS (
          SELECT 1 FROM task_assignees ta
          WHERE ta.task_id = t.id AND ta.user_id = u.id
        ) OR t.assigned_to = u.id)
      )::INTEGER as overdue_tasks,
      COUNT(DISTINCT t.id) FILTER (
        WHERE t.task_status = 'Done'
        AND t.deleted_at IS NULL
        AND (
          EXISTS (
            SELECT 1 FROM task_assignees ta
            WHERE ta.task_id = t.id AND ta.user_id = u.id
          )
          OR t.assigned_to = u.id
        )
      )::INTEGER as tasks_waiting_review
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id
    LEFT JOIN tasks t ON (
      EXISTS (
        SELECT 1 FROM task_assignees ta
        WHERE ta.task_id = t.id AND ta.user_id = u.id
      )
      OR t.assigned_to = u.id
      OR t.review_requested_by = u.id
    )
    WHERE u.id = p_user_id AND u.is_active = true
      AND (t.deleted_at IS NULL OR t.id IS NULL)
    GROUP BY u.id, u.full_name, u.email, r.name;
  END IF;
END;
$$;

-- ============================================
-- 16. Update get_task_urgency_summary to use task_status
-- ============================================
-- This function is used by the dashboard breakdown and needs to use the canonical lifecycle
DROP FUNCTION IF EXISTS get_task_urgency_summary(UUID) CASCADE;

CREATE OR REPLACE FUNCTION get_task_urgency_summary(p_user_id UUID)
RETURNS TABLE (
  status VARCHAR,
  overdue_count INTEGER,
  due_today_count INTEGER,
  due_soon_count INTEGER,
  total_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Super Admin and Admin see all tasks
  IF EXISTS (
    SELECT 1 FROM users u
    JOIN roles r ON u.role_id = r.id
    WHERE u.id = p_user_id AND r.name IN ('super_admin', 'admin')
  ) THEN
    RETURN QUERY
    SELECT 
      t.task_status as status,  -- Use task_status instead of status
      COUNT(*) FILTER (WHERE t.due_date IS NOT NULL AND t.due_date < NOW() AND t.task_status != 'Closed')::INTEGER as overdue_count,
      COUNT(*) FILTER (WHERE t.due_date IS NOT NULL AND DATE(t.due_date) = CURRENT_DATE AND t.task_status != 'Closed')::INTEGER as due_today_count,
      COUNT(*) FILTER (WHERE t.due_date IS NOT NULL AND t.due_date > NOW() AND t.due_date <= NOW() + INTERVAL '3 days' AND t.task_status != 'Closed')::INTEGER as due_soon_count,
      COUNT(*)::INTEGER as total_count
    FROM tasks t
    WHERE t.deleted_at IS NULL
      AND (t.task_status != 'Closed' OR t.closed_reason = 'project_closed')
    GROUP BY t.task_status
    ORDER BY 
      CASE t.task_status
        WHEN 'ToDo' THEN 1
        WHEN 'Work-In-Progress' THEN 2
        WHEN 'Done' THEN 3
        WHEN 'Closed' THEN 4
        ELSE 5
      END;
  -- Users see only their tasks
  ELSE
    RETURN QUERY
    SELECT 
      t.task_status as status,  -- Use task_status instead of status
      COUNT(*) FILTER (WHERE t.due_date IS NOT NULL AND t.due_date < NOW() AND t.task_status != 'Closed')::INTEGER as overdue_count,
      COUNT(*) FILTER (WHERE t.due_date IS NOT NULL AND DATE(t.due_date) = CURRENT_DATE AND t.task_status != 'Closed')::INTEGER as due_today_count,
      COUNT(*) FILTER (WHERE t.due_date IS NOT NULL AND t.due_date > NOW() AND t.due_date <= NOW() + INTERVAL '3 days' AND t.task_status != 'Closed')::INTEGER as due_soon_count,
      COUNT(*)::INTEGER as total_count
    FROM tasks t
    WHERE t.deleted_at IS NULL
      AND (
        EXISTS (
          SELECT 1 FROM task_assignees ta
          WHERE ta.task_id = t.id AND ta.user_id = p_user_id
        )
        OR t.assigned_to = p_user_id
      )
      AND (t.task_status != 'Closed' OR t.closed_reason = 'project_closed')
    GROUP BY t.task_status
    ORDER BY 
      CASE t.task_status
        WHEN 'ToDo' THEN 1
        WHEN 'Work-In-Progress' THEN 2
        WHEN 'Done' THEN 3
        WHEN 'Closed' THEN 4
        ELSE 5
      END;
  END IF;
END;
$$;

-- ============================================
-- 17. Update user performance functions to use task_status
-- ============================================
-- Update get_user_task_counts to use canonical lifecycle
DROP FUNCTION IF EXISTS get_user_task_counts(UUID) CASCADE;

CREATE OR REPLACE FUNCTION get_user_task_counts(p_user_id UUID)
RETURNS TABLE (
  total_assigned BIGINT,
  total_completed BIGINT,
  total_pending BIGINT,
  total_in_progress BIGINT,
  total_pending_review BIGINT,
  total_archived BIGINT,
  completion_rate NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_assigned BIGINT := 0;
  v_total_completed BIGINT := 0;
  v_total_pending BIGINT := 0;
  v_total_in_progress BIGINT := 0;
  v_total_pending_review BIGINT := 0;
  v_total_archived BIGINT := 0;
  v_completion_rate NUMERIC := 0;
BEGIN
  -- Count all tasks assigned to user (via task_assignees or legacy assigned_to)
  SELECT COUNT(DISTINCT t.id) INTO v_total_assigned
  FROM tasks t
  WHERE t.deleted_at IS NULL
    AND (
      EXISTS (
        SELECT 1 FROM task_assignees ta
        WHERE ta.task_id = t.id
        AND ta.user_id = p_user_id
      )
      OR t.assigned_to = p_user_id
    );

  -- Count completed tasks (Closed status = complete)
  SELECT COUNT(DISTINCT t.id) INTO v_total_completed
  FROM tasks t
  WHERE t.deleted_at IS NULL
    AND (
      EXISTS (
        SELECT 1 FROM task_assignees ta
        WHERE ta.task_id = t.id
        AND ta.user_id = p_user_id
      )
      OR t.assigned_to = p_user_id
    )
    AND t.task_status = 'Closed';

  -- Count pending tasks (ToDo status)
  SELECT COUNT(DISTINCT t.id) INTO v_total_pending
  FROM tasks t
  WHERE t.deleted_at IS NULL
    AND t.task_status = 'ToDo'
    AND (
      EXISTS (
        SELECT 1 FROM task_assignees ta
        WHERE ta.task_id = t.id
        AND ta.user_id = p_user_id
      )
      OR t.assigned_to = p_user_id
    );

  -- Count in progress tasks (Work-In-Progress status)
  SELECT COUNT(DISTINCT t.id) INTO v_total_in_progress
  FROM tasks t
  WHERE t.deleted_at IS NULL
    AND t.task_status = 'Work-In-Progress'
    AND (
      EXISTS (
        SELECT 1 FROM task_assignees ta
        WHERE ta.task_id = t.id
        AND ta.user_id = p_user_id
      )
      OR t.assigned_to = p_user_id
    );

  -- Count pending review tasks (Done status = pending review)
  SELECT COUNT(DISTINCT t.id) INTO v_total_pending_review
  FROM tasks t
  WHERE t.deleted_at IS NULL
    AND t.task_status = 'Done'
    AND (
      EXISTS (
        SELECT 1 FROM task_assignees ta
        WHERE ta.task_id = t.id
        AND ta.user_id = p_user_id
      )
      OR t.assigned_to = p_user_id
    );

  -- Count archived/closed tasks (Closed status)
  SELECT COUNT(DISTINCT t.id) INTO v_total_archived
  FROM tasks t
  WHERE t.deleted_at IS NULL
    AND t.task_status = 'Closed'
    AND (
      EXISTS (
        SELECT 1 FROM task_assignees ta
        WHERE ta.task_id = t.id
        AND ta.user_id = p_user_id
      )
      OR t.assigned_to = p_user_id
    );

  -- Calculate completion rate (completed / total assigned)
  IF v_total_assigned > 0 THEN
    v_completion_rate := ROUND((v_total_completed::NUMERIC / v_total_assigned::NUMERIC) * 100, 2);
  END IF;

  RETURN QUERY SELECT
    v_total_assigned,
    v_total_completed,
    v_total_pending,
    v_total_in_progress,
    v_total_pending_review,
    v_total_archived,
    v_completion_rate;
END;
$$;

-- Update get_user_performance_summary to use task_status
DROP FUNCTION IF EXISTS get_user_performance_summary(UUID) CASCADE;

CREATE OR REPLACE FUNCTION public.get_user_performance_summary(
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task_counts RECORD;
  v_avg_completion_time INTERVAL;
  v_on_time_count BIGINT := 0;
  v_overdue_count BIGINT := 0;
  v_currently_overdue_count BIGINT := 0;
  v_timeliness_rate NUMERIC := 0;
  v_review_approval_rate NUMERIC := 0;
  v_reviewed_count BIGINT := 0;
  v_approved_count BIGINT := 0;
  v_this_week_completed BIGINT := 0;
  v_last_week_completed BIGINT := 0;
  v_week_over_week_change NUMERIC := 0;
  v_result JSONB;
BEGIN
  -- Get task counts (uses updated get_user_task_counts)
  SELECT * INTO v_task_counts
  FROM public.get_user_task_counts(p_user_id);

  -- Calculate average completion time (for completed tasks = Closed)
  SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (
    COALESCE(t.archived_at, t.updated_at) - t.created_at
  ))), 0) INTO v_avg_completion_time
  FROM tasks t
  WHERE t.deleted_at IS NULL
    AND (
      EXISTS (
        SELECT 1 FROM task_assignees ta
        WHERE ta.task_id = t.id
        AND ta.user_id = p_user_id
      )
      OR t.assigned_to = p_user_id
    )
    AND t.task_status = 'Closed';

  -- Count on-time tasks (Closed tasks completed before or on due_date - historical performance)
  SELECT COUNT(DISTINCT t.id) INTO v_on_time_count
  FROM tasks t
  WHERE t.deleted_at IS NULL
    AND t.due_date IS NOT NULL
    AND t.task_status = 'Closed'
    AND (
      EXISTS (
        SELECT 1 FROM task_assignees ta
        WHERE ta.task_id = t.id
        AND ta.user_id = p_user_id
      )
      OR t.assigned_to = p_user_id
    )
    AND COALESCE(t.archived_at, t.updated_at) <= t.due_date;

  -- Count currently overdue tasks (active tasks assigned to user with due_date in the past)
  -- This shows tasks that are currently overdue and need attention
  SELECT COUNT(DISTINCT t.id) INTO v_currently_overdue_count
  FROM tasks t
  WHERE t.deleted_at IS NULL
    AND t.due_date IS NOT NULL
    AND t.due_date < NOW()
    AND t.task_status != 'Closed'  -- Active tasks only (ToDo, Work-In-Progress, or Done)
    AND (
      EXISTS (
        SELECT 1 FROM task_assignees ta
        WHERE ta.task_id = t.id
        AND ta.user_id = p_user_id
      )
      OR t.assigned_to = p_user_id
    );

  -- Count historically overdue completed tasks (for timeliness rate calculation)
  SELECT COUNT(DISTINCT t.id) INTO v_overdue_count
  FROM tasks t
  WHERE t.deleted_at IS NULL
    AND t.due_date IS NOT NULL
    AND t.task_status = 'Closed'
    AND (
      EXISTS (
        SELECT 1 FROM task_assignees ta
        WHERE ta.task_id = t.id
        AND ta.user_id = p_user_id
      )
      OR t.assigned_to = p_user_id
    )
    AND COALESCE(t.archived_at, t.updated_at) > t.due_date;

  -- Calculate timeliness rate (based on historical completion performance only)
  -- This is the percentage of completed tasks that were completed on time
  IF (v_on_time_count + v_overdue_count) > 0 THEN
    v_timeliness_rate := ROUND((v_on_time_count::NUMERIC / (v_on_time_count + v_overdue_count)::NUMERIC) * 100, 2);
  END IF;
  
  -- Set overdue_count to currently overdue tasks (what user wants to see)
  -- This shows active tasks that are overdue, not historical completions
  v_overdue_count := v_currently_overdue_count;

  -- Calculate review approval rate (tasks that were reviewed and approved)
  -- Reviewed = tasks that were reviewed (have reviewed_at set)
  -- This includes both approved (Closed) and rejected (Work-In-Progress) tasks
  SELECT COUNT(DISTINCT t.id) INTO v_reviewed_count
  FROM tasks t
  WHERE t.deleted_at IS NULL
    AND t.reviewed_at IS NOT NULL
    AND t.review_requested_at IS NOT NULL  -- Must have been requested for review first
    AND (
      EXISTS (
        SELECT 1 FROM task_assignees ta
        WHERE ta.task_id = t.id
        AND ta.user_id = p_user_id
      )
      OR t.assigned_to = p_user_id
    );

  -- Approved = tasks that are Closed AND were reviewed (review was approved)
  -- Only count tasks that transitioned from Done -> Closed (approved)
  SELECT COUNT(DISTINCT t.id) INTO v_approved_count
  FROM tasks t
  WHERE t.deleted_at IS NULL
    AND t.task_status = 'Closed'
    AND t.reviewed_at IS NOT NULL
    AND t.review_requested_at IS NOT NULL  -- Ensure it was actually reviewed (had a review request)
    AND (
      EXISTS (
        SELECT 1 FROM task_assignees ta
        WHERE ta.task_id = t.id
        AND ta.user_id = p_user_id
      )
      OR t.assigned_to = p_user_id
    );

  -- Only calculate approval rate if there are reviewed tasks
  -- Approval rate = approved / all_reviewed
  IF v_reviewed_count > 0 THEN
    v_review_approval_rate := ROUND((v_approved_count::NUMERIC / v_reviewed_count::NUMERIC) * 100, 2);
  END IF;

  -- Calculate weekly completion stats (Closed tasks only)
  -- This week (Monday to Sunday of current week)
  SELECT COUNT(DISTINCT t.id) INTO v_this_week_completed
  FROM tasks t
  WHERE t.deleted_at IS NULL
    AND t.task_status = 'Closed'
    AND (
      EXISTS (
        SELECT 1 FROM task_assignees ta
        WHERE ta.task_id = t.id
        AND ta.user_id = p_user_id
      )
      OR t.assigned_to = p_user_id
    )
    AND COALESCE(t.archived_at, t.updated_at) >= date_trunc('week', CURRENT_DATE);

  -- Last week
  SELECT COUNT(DISTINCT t.id) INTO v_last_week_completed
  FROM tasks t
  WHERE t.deleted_at IS NULL
    AND t.task_status = 'Closed'
    AND (
      EXISTS (
        SELECT 1 FROM task_assignees ta
        WHERE ta.task_id = t.id
        AND ta.user_id = p_user_id
      )
      OR t.assigned_to = p_user_id
    )
    AND COALESCE(t.archived_at, t.updated_at) >= date_trunc('week', CURRENT_DATE) - INTERVAL '1 week'
    AND COALESCE(t.archived_at, t.updated_at) < date_trunc('week', CURRENT_DATE);

  -- Calculate week-over-week change
  IF v_last_week_completed > 0 THEN
    v_week_over_week_change := ROUND(((v_this_week_completed::NUMERIC - v_last_week_completed::NUMERIC) / v_last_week_completed::NUMERIC) * 100, 2);
  ELSIF v_this_week_completed > 0 THEN
    v_week_over_week_change := 100; -- 100% increase from 0
  END IF;

  -- Build result JSON
  v_result := jsonb_build_object(
    'task_counts', jsonb_build_object(
      'total_assigned', v_task_counts.total_assigned,
      'total_completed', v_task_counts.total_completed,
      'total_pending', v_task_counts.total_pending,
      'total_in_progress', v_task_counts.total_in_progress,
      'total_pending_review', v_task_counts.total_pending_review,
      'total_archived', v_task_counts.total_archived,
      'completion_rate', v_task_counts.completion_rate
    ),
    'avg_completion_time_seconds', EXTRACT(EPOCH FROM v_avg_completion_time),
    'timeliness', jsonb_build_object(
      'on_time_count', v_on_time_count,
      'overdue_count', v_overdue_count,
      'timeliness_rate', v_timeliness_rate
    ),
    'review_metrics', jsonb_build_object(
      'reviewed_count', v_reviewed_count,
      'approved_count', v_approved_count,
      'approval_rate', v_review_approval_rate
    ),
    'weekly_stats', jsonb_build_object(
      'this_week_completed', v_this_week_completed,
      'last_week_completed', v_last_week_completed,
      'week_over_week_change', v_week_over_week_change
    )
  );

  RETURN v_result;
END;
$$;

-- Update get_user_weekly_trends to use task_status
DROP FUNCTION IF EXISTS get_user_weekly_trends(UUID, INTEGER) CASCADE;

CREATE OR REPLACE FUNCTION public.get_user_weekly_trends(
  p_user_id UUID,
  p_weeks INTEGER DEFAULT 8
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_week_start DATE;
  v_week_end DATE;
  v_week_data JSONB := '[]'::JSONB;
  v_week_record JSONB;
  v_completed_count BIGINT;
  v_week_index INTEGER;
BEGIN
  -- Generate weekly data for the last p_weeks weeks
  FOR v_week_index IN 0..(p_weeks - 1) LOOP
    v_week_start := date_trunc('week', CURRENT_DATE) - (v_week_index * INTERVAL '1 week');
    v_week_end := v_week_start + INTERVAL '6 days';

    -- Count completed tasks in this week (Closed status = completed)
    SELECT COUNT(DISTINCT t.id) INTO v_completed_count
    FROM tasks t
    WHERE t.deleted_at IS NULL
      AND t.task_status = 'Closed'
      AND (
        EXISTS (
          SELECT 1 FROM task_assignees ta
          WHERE ta.task_id = t.id
          AND ta.user_id = p_user_id
        )
        OR t.assigned_to = p_user_id
      )
      AND COALESCE(t.archived_at, t.updated_at) >= v_week_start
      AND COALESCE(t.archived_at, t.updated_at) < v_week_end + INTERVAL '1 day';

    v_week_record := jsonb_build_object(
      'week_start', v_week_start,
      'week_end', v_week_end,
      'week_label', to_char(v_week_start, 'Mon DD') || ' - ' || to_char(v_week_end, 'Mon DD'),
      'completed_count', v_completed_count
    );

    v_week_data := v_week_data || jsonb_build_array(v_week_record);
  END LOOP;

  -- Reverse to show oldest to newest
  RETURN (
    SELECT jsonb_agg(elem ORDER BY (elem->>'week_start')::DATE)
    FROM jsonb_array_elements(v_week_data) elem
  );
END;
$$;

-- ============================================
-- 19. Update get_project_health_summary to use task_status and add Work-In-Progress count
-- ============================================
DROP FUNCTION IF EXISTS get_project_health_summary(UUID) CASCADE;

CREATE OR REPLACE FUNCTION get_project_health_summary(p_user_id UUID)
RETURNS TABLE (
  project_id UUID,
  project_name VARCHAR,
  project_status VARCHAR,
  total_tasks INTEGER,
  open_tasks INTEGER,
  work_in_progress_tasks INTEGER,
  overdue_tasks INTEGER,
  closed_tasks INTEGER,
  completion_percentage NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Super Admin and Admin see all projects
  IF EXISTS (
    SELECT 1 FROM users u
    JOIN roles r ON u.role_id = r.id
    WHERE u.id = p_user_id AND r.name IN ('super_admin', 'admin')
  ) THEN
    RETURN QUERY
    WITH project_task_counts AS (
      SELECT 
        p.id as project_id,
        p.name as project_name,
        p.status as project_status,
        COUNT(DISTINCT t.id) as total_tasks,
        COUNT(DISTINCT CASE WHEN t.task_status != 'Closed' THEN t.id END) as open_tasks,
        COUNT(DISTINCT CASE WHEN t.task_status = 'Work-In-Progress' THEN t.id END) as work_in_progress_tasks,
        COUNT(DISTINCT CASE WHEN t.due_date IS NOT NULL AND t.due_date < NOW() AND t.task_status != 'Closed' THEN t.id END) as overdue_tasks,
        COUNT(DISTINCT CASE WHEN t.task_status = 'Closed' THEN t.id END) as closed_tasks
      FROM projects p
      LEFT JOIN tasks t ON t.project_id = p.id AND t.deleted_at IS NULL
      GROUP BY p.id, p.name, p.status
    )
    SELECT 
      ptc.project_id,
      ptc.project_name,
      ptc.project_status,
      COALESCE(ptc.total_tasks, 0)::INTEGER as total_tasks,
      COALESCE(ptc.open_tasks, 0)::INTEGER as open_tasks,
      COALESCE(ptc.work_in_progress_tasks, 0)::INTEGER as work_in_progress_tasks,
      COALESCE(ptc.overdue_tasks, 0)::INTEGER as overdue_tasks,
      COALESCE(ptc.closed_tasks, 0)::INTEGER as closed_tasks,
      CASE 
        WHEN COALESCE(ptc.total_tasks, 0) > 0 THEN
          ROUND((COALESCE(ptc.closed_tasks, 0)::NUMERIC / ptc.total_tasks::NUMERIC) * 100, 1)
        ELSE 0::NUMERIC
      END as completion_percentage
    FROM project_task_counts ptc
    ORDER BY 
      CASE ptc.project_status
        WHEN 'closed' THEN 2
        WHEN 'active' THEN 1
        ELSE 3
      END,
      ptc.project_name;
  -- Users see only projects they're assigned to
  ELSE
    RETURN QUERY
    WITH project_task_counts AS (
      SELECT 
        p.id as project_id,
        p.name as project_name,
        p.status as project_status,
        COUNT(DISTINCT t.id) as total_tasks,
        COUNT(DISTINCT CASE WHEN t.task_status != 'Closed' THEN t.id END) as open_tasks,
        COUNT(DISTINCT CASE WHEN t.task_status = 'Work-In-Progress' THEN t.id END) as work_in_progress_tasks,
        COUNT(DISTINCT CASE WHEN t.due_date IS NOT NULL AND t.due_date < NOW() AND t.task_status != 'Closed' THEN t.id END) as overdue_tasks,
        COUNT(DISTINCT CASE WHEN t.task_status = 'Closed' THEN t.id END) as closed_tasks
      FROM projects p
      INNER JOIN tasks t ON t.project_id = p.id AND t.deleted_at IS NULL
      WHERE (
          t.assigned_to = p_user_id
          OR EXISTS (
            SELECT 1 FROM task_assignees ta
            WHERE ta.task_id = t.id AND ta.user_id = p_user_id
          )
        )
      GROUP BY p.id, p.name, p.status
    )
    SELECT 
      ptc.project_id,
      ptc.project_name,
      ptc.project_status,
      COALESCE(ptc.total_tasks, 0)::INTEGER as total_tasks,
      COALESCE(ptc.open_tasks, 0)::INTEGER as open_tasks,
      COALESCE(ptc.work_in_progress_tasks, 0)::INTEGER as work_in_progress_tasks,
      COALESCE(ptc.overdue_tasks, 0)::INTEGER as overdue_tasks,
      COALESCE(ptc.closed_tasks, 0)::INTEGER as closed_tasks,
      CASE 
        WHEN COALESCE(ptc.total_tasks, 0) > 0 THEN
          ROUND((COALESCE(ptc.closed_tasks, 0)::NUMERIC / ptc.total_tasks::NUMERIC) * 100, 1)
        ELSE 0::NUMERIC
      END as completion_percentage
    FROM project_task_counts ptc
    ORDER BY 
      CASE ptc.project_status
        WHEN 'closed' THEN 2
        WHEN 'active' THEN 1
        ELSE 3
      END,
      ptc.project_name;
  END IF;
END;
$$;

-- ============================================
-- 20. Final fix: Ensure all tasks with status='in_progress' have task_status='Work-In-Progress'
-- ============================================
-- This is a safety net to catch any tasks that might have been missed or created/updated after migration
DO $$
BEGIN
  -- Disable trigger if it exists
  IF EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'enforce_task_lifecycle_transitions_trigger'
  ) THEN
    ALTER TABLE tasks DISABLE TRIGGER enforce_task_lifecycle_transitions_trigger;
  END IF;
END $$;

-- Update any remaining tasks with status='in_progress' to have task_status='Work-In-Progress'
UPDATE tasks t
SET task_status = 'Work-In-Progress', updated_at = NOW()
WHERE t.deleted_at IS NULL
  AND t.status = 'in_progress'
  AND t.task_status != 'Work-In-Progress'
  AND t.task_status != 'Closed'
  AND t.task_status != 'Done';

-- Also fix any tasks with status='blocked' (should be Work-In-Progress)
UPDATE tasks t
SET task_status = 'Work-In-Progress', updated_at = NOW()
WHERE t.deleted_at IS NULL
  AND t.status = 'blocked'
  AND t.task_status != 'Work-In-Progress'
  AND t.task_status != 'Closed'
  AND t.task_status != 'Done';

-- Re-enable the trigger
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'enforce_task_lifecycle_transitions_trigger'
  ) THEN
    ALTER TABLE tasks ENABLE TRIGGER enforce_task_lifecycle_transitions_trigger;
  END IF;
END $$;

-- ============================================
-- 21. Migration complete - old status fields deprecated but kept for compatibility
-- ============================================
-- Note: The old 'status' and 'review_status' fields are kept for backward compatibility
-- but should not be used going forward. All new code should use 'task_status'.
-- A future migration can remove these fields after all code is updated.

COMMENT ON COLUMN tasks.status IS 'DEPRECATED: Use task_status instead. Kept for backward compatibility during migration.';
COMMENT ON COLUMN tasks.review_status IS 'DEPRECATED: Review state is now part of task_status. Kept for backward compatibility during migration.';
