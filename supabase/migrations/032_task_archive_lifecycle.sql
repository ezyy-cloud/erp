-- Migration 032: Task Archive Lifecycle
-- Implements task lifecycle with archive functionality
-- Tasks can be: Active, Done (Pending Review), Archived (Closed)

-- 1. Add archive fields to tasks table
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_requested_at TIMESTAMPTZ;

-- 2. Add index for archived_at for performance
CREATE INDEX IF NOT EXISTS idx_tasks_archived_at ON tasks(archived_at) WHERE archived_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_archived_by ON tasks(archived_by) WHERE archived_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_review_requested_at ON tasks(review_requested_at) WHERE review_requested_at IS NOT NULL;

-- 3. Add comments for documentation
COMMENT ON COLUMN tasks.archived_at IS 'Timestamp when task was archived (closed)';
COMMENT ON COLUMN tasks.archived_by IS 'User who archived the task (Super Admin only)';
COMMENT ON COLUMN tasks.review_requested_at IS 'Timestamp when review was requested (when task marked as done)';

-- 4. Create function to mark task as done (pending review)
-- This is called when an ordinary user marks a task as done
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
  v_user_role VARCHAR(50);
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

  -- Check if task is already archived
  IF v_task.archived_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot modify archived task'
    );
  END IF;

  -- Get user role
  SELECT r.name INTO v_user_role
  FROM users u
  JOIN roles r ON u.role_id = r.id
  WHERE u.id = p_user_id;

  -- Only ordinary users can mark tasks as done (admins and super admins can use direct status updates)
  -- But we allow all users to mark as done for flexibility
  -- The key is that marking as done triggers review workflow

  -- Update task: set status to 'done' and review_status to 'pending_review'
  UPDATE tasks
  SET
    status = 'done',
    review_status = 'pending_review',
    review_requested_by = p_user_id,
    review_requested_at = NOW(),
    updated_at = NOW()
  WHERE id = p_task_id;

  -- Log progress
  INSERT INTO task_progress_log (task_id, user_id, status, progress_note, created_by)
  VALUES (p_task_id, p_user_id, 'done', 'Task marked as done - pending review', p_user_id);

  -- Trigger notification
  PERFORM public.create_review_requested_notification(p_task_id, p_user_id);

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Task marked as done and review requested'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- 5. Create function to archive task (Super Admin only)
CREATE OR REPLACE FUNCTION public.archive_task(
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
  v_user_role VARCHAR(50);
BEGIN
  -- Validate that user is Super Admin
  IF NOT public.user_has_role(ARRAY['super_admin']) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Only Super Admin can archive tasks'
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

  -- Check if already archived
  IF v_task.archived_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Task is already archived'
    );
  END IF;

  -- Archive the task
  UPDATE tasks
  SET
    archived_at = NOW(),
    archived_by = p_user_id,
    status = 'closed',
    review_status = 'reviewed_approved',
    reviewed_by = p_user_id,
    reviewed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_task_id;

  -- Log progress
  INSERT INTO task_progress_log (task_id, user_id, status, progress_note, created_by)
  VALUES (p_task_id, p_user_id, 'closed', 'Task archived (closed)', p_user_id);

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Task archived successfully'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- 6. Create function to unarchive task (Super Admin only)
CREATE OR REPLACE FUNCTION public.unarchive_task(
  p_task_id UUID,
  p_user_id UUID,
  p_new_status VARCHAR(50) DEFAULT 'to_do'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task tasks;
  v_previous_status VARCHAR(50);
BEGIN
  -- Validate that user is Super Admin
  IF NOT public.user_has_role(ARRAY['super_admin']) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Only Super Admin can unarchive tasks'
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

  -- Check if task is archived
  IF v_task.archived_at IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Task is not archived'
    );
  END IF;

  -- Store previous status (before it was closed)
  v_previous_status := COALESCE(v_task.status_before_closure, 'to_do');

  -- Unarchive the task
  UPDATE tasks
  SET
    archived_at = NULL,
    archived_by = NULL,
    status = p_new_status,
    review_status = 'none',
    review_requested_by = NULL,
    review_requested_at = NULL,
    reviewed_by = NULL,
    reviewed_at = NULL,
    review_comments = NULL,
    updated_at = NOW()
  WHERE id = p_task_id;

  -- Log progress
  INSERT INTO task_progress_log (task_id, user_id, status, progress_note, created_by)
  VALUES (p_task_id, p_user_id, p_new_status, 'Task unarchived (reopened)', p_user_id);

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Task unarchived successfully'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- 7. Update approve_task function to automatically archive on approval
-- We'll modify the existing review workflow to archive on approval
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
      'error', 'Only Super Admin can approve and archive tasks'
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

  -- Check if already archived
  IF v_task.archived_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Task is already archived'
    );
  END IF;

  -- Approve and archive in one operation
  UPDATE tasks
  SET
    review_status = 'reviewed_approved',
    reviewed_by = p_user_id,
    reviewed_at = NOW(),
    review_comments = p_comments,
    archived_at = NOW(),
    archived_by = p_user_id,
    status = 'closed',
    updated_at = NOW()
  WHERE id = p_task_id;

  -- Log progress
  INSERT INTO task_progress_log (task_id, user_id, status, progress_note, created_by)
  VALUES (p_task_id, p_user_id, 'closed', 'Task approved and archived', p_user_id);

  -- Trigger notification
  PERFORM public.create_review_completed_notification(p_task_id, p_user_id, 'reviewed_approved');

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Task approved and archived successfully'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- 8. Create function to reject review and return to active
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
  v_previous_status VARCHAR(50);
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

  -- Check if task is archived
  IF v_task.archived_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot reject review for archived task'
    );
  END IF;

  -- Get previous status (before it was marked as done)
  -- We'll use 'in_progress' as default if not available
  v_previous_status := COALESCE(v_task.status_before_closure, 'in_progress');

  -- Reject review and return to active status
  UPDATE tasks
  SET
    review_status = 'changes_requested',
    reviewed_by = p_user_id,
    reviewed_at = NOW(),
    review_comments = p_comments,
    status = v_previous_status,
    updated_at = NOW()
  WHERE id = p_task_id;

  -- Log progress
  INSERT INTO task_progress_log (task_id, user_id, status, progress_note, created_by)
  VALUES (p_task_id, p_user_id, v_previous_status, 'Review rejected - task returned to active', p_user_id);

  -- Trigger notification
  PERFORM public.create_review_completed_notification(p_task_id, p_user_id, 'changes_requested');

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Review rejected and task returned to active'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- 9. Grant execute permissions
GRANT EXECUTE ON FUNCTION public.mark_task_done_pending_review(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_task(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unarchive_task(UUID, UUID, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_and_archive_task(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_review_and_reopen(UUID, UUID, TEXT) TO authenticated;

-- 10. Add comments for documentation
COMMENT ON FUNCTION mark_task_done_pending_review IS 'Marks a task as done and requests review. Called when ordinary user marks task as done.';
COMMENT ON FUNCTION archive_task IS 'Archives a task (Super Admin only). Task becomes closed and hidden from active lists.';
COMMENT ON FUNCTION unarchive_task IS 'Unarchives a task (Super Admin only). Restores task to active state.';
COMMENT ON FUNCTION approve_and_archive_task IS 'Approves a review request and archives the task in one operation (Super Admin only).';
COMMENT ON FUNCTION reject_review_and_reopen IS 'Rejects a review request and returns task to active status (Super Admin only).';
