-- Migration 030: Create Soft Delete Functions
-- Database functions for soft deleting tasks and users
-- Only Super Admin can call these functions
-- Includes validation and prevents deletion if pending edit requests exist

-- ============================================
-- 1. Soft Delete Task Function
-- ============================================

CREATE OR REPLACE FUNCTION soft_delete_task(
  task_id UUID,
  deleted_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  task_record RECORD;
  pending_requests INTEGER;
BEGIN
  -- Validate that deleter is Super Admin
  IF NOT public.user_has_role(ARRAY['super_admin']) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Only Super Admin can delete tasks'
    );
  END IF;

  -- Fetch the task
  SELECT * INTO task_record
  FROM tasks
  WHERE id = task_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Task not found'
    );
  END IF;

  -- Check if task is already deleted
  IF task_record.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Task is already deleted'
    );
  END IF;

  -- Check if task has pending edit requests
  SELECT COUNT(*) INTO pending_requests
  FROM task_edit_requests
  WHERE task_id = soft_delete_task.task_id
  AND status = 'pending';

  IF pending_requests > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot delete task with pending edit requests. Please approve or reject all requests first.'
    );
  END IF;

  -- Soft delete the task
  UPDATE tasks
  SET
    deleted_at = NOW(),
    deleted_by = deleted_by,
    updated_at = NOW()
  WHERE id = task_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Task soft-deleted successfully'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION soft_delete_task(UUID, UUID) TO authenticated;

-- ============================================
-- 2. Restore Task Function
-- ============================================

CREATE OR REPLACE FUNCTION restore_task(
  task_id UUID,
  restored_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  task_record RECORD;
BEGIN
  -- Validate that restorer is Super Admin
  IF NOT public.user_has_role(ARRAY['super_admin']) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Only Super Admin can restore tasks'
    );
  END IF;

  -- Fetch the task
  SELECT * INTO task_record
  FROM tasks
  WHERE id = task_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Task not found'
    );
  END IF;

  -- Check if task is not deleted
  IF task_record.deleted_at IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Task is not deleted'
    );
  END IF;

  -- Restore the task
  UPDATE tasks
  SET
    deleted_at = NULL,
    deleted_by = NULL,
    updated_at = NOW()
  WHERE id = task_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Task restored successfully'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION restore_task(UUID, UUID) TO authenticated;

-- ============================================
-- 3. Soft Delete User Function
-- ============================================

CREATE OR REPLACE FUNCTION soft_delete_user(
  user_id UUID,
  deleted_by UUID,
  reassign_tasks_to UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_record RECORD;
  pending_requests INTEGER;
  task_count INTEGER;
  reassigned_count INTEGER;
BEGIN
  -- Validate that deleter is Super Admin
  IF NOT public.user_has_role(ARRAY['super_admin']) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Only Super Admin can delete users'
    );
  END IF;

  -- Cannot delete yourself
  IF user_id = deleted_by THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot delete your own account'
    );
  END IF;

  -- Fetch the user
  SELECT * INTO user_record
  FROM users
  WHERE id = user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User not found'
    );
  END IF;

  -- Check if user is already deleted
  IF user_record.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User is already deleted'
    );
  END IF;

  -- Check if user has pending edit requests
  SELECT COUNT(*) INTO pending_requests
  FROM task_edit_requests
  WHERE requested_by = user_id
  AND status = 'pending';

  IF pending_requests > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot delete user with pending edit requests. Please approve or reject all requests first.'
    );
  END IF;

  -- Count tasks assigned to this user
  SELECT COUNT(*) INTO task_count
  FROM task_assignees
  WHERE user_id = soft_delete_user.user_id;

  -- Reassign tasks if requested
  IF reassign_tasks_to IS NOT NULL THEN
    -- Verify target user exists and is not deleted
    IF NOT EXISTS (
      SELECT 1 FROM users
      WHERE id = reassign_tasks_to
      AND deleted_at IS NULL
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Target user for reassignment not found or is deleted'
      );
    END IF;

    -- Reassign tasks
    UPDATE task_assignees
    SET user_id = reassign_tasks_to,
        assigned_by = deleted_by
    WHERE user_id = soft_delete_user.user_id;

    GET DIAGNOSTICS reassigned_count = ROW_COUNT;
  END IF;

  -- Soft delete the user
  UPDATE users
  SET
    deleted_at = NOW(),
    deleted_by = deleted_by,
    updated_at = NOW()
  WHERE id = user_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'User soft-deleted successfully',
    'tasks_reassigned', COALESCE(reassigned_count, 0),
    'tasks_orphaned', task_count - COALESCE(reassigned_count, 0)
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION soft_delete_user(UUID, UUID, UUID) TO authenticated;

-- ============================================
-- 4. Restore User Function
-- ============================================

CREATE OR REPLACE FUNCTION restore_user(
  user_id UUID,
  restored_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_record RECORD;
BEGIN
  -- Validate that restorer is Super Admin
  IF NOT public.user_has_role(ARRAY['super_admin']) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Only Super Admin can restore users'
    );
  END IF;

  -- Fetch the user
  SELECT * INTO user_record
  FROM users
  WHERE id = user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User not found'
    );
  END IF;

  -- Check if user is not deleted
  IF user_record.deleted_at IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User is not deleted'
    );
  END IF;

  -- Restore the user
  UPDATE users
  SET
    deleted_at = NULL,
    deleted_by = NULL,
    updated_at = NOW()
  WHERE id = user_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'User restored successfully'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION restore_user(UUID, UUID) TO authenticated;

-- Add comments
COMMENT ON FUNCTION soft_delete_task IS 'Soft deletes a task. Only Super Admin can call this. Prevents deletion if pending edit requests exist.';
COMMENT ON FUNCTION restore_task IS 'Restores a soft-deleted task. Only Super Admin can call this.';
COMMENT ON FUNCTION soft_delete_user IS 'Soft deletes a user. Only Super Admin can call this. Optionally reassigns user tasks to another user. Prevents deletion if pending edit requests exist.';
COMMENT ON FUNCTION restore_user IS 'Restores a soft-deleted user. Only Super Admin can call this.';
