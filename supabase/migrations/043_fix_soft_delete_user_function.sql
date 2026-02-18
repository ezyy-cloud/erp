-- Migration 043: Fix soft_delete_user function ambiguity
-- - Avoids ambiguous user_id references by qualifying parameter and column names
-- - Keeps function signature compatible with existing Supabase schema cache
-- - Ensures deleted_by and reassign_tasks_to are correctly recorded and used

-- Drop the existing function definition so we can safely update the body
DROP FUNCTION IF EXISTS soft_delete_user(UUID, UUID, UUID);

CREATE FUNCTION soft_delete_user(
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
  IF soft_delete_user.user_id = soft_delete_user.deleted_by THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot delete your own account'
    );
  END IF;

  -- Fetch the user
  SELECT * INTO user_record
  FROM users u
  WHERE u.id = soft_delete_user.user_id;

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
  FROM task_edit_requests ter
  WHERE ter.requested_by = soft_delete_user.user_id
    AND ter.status = 'pending';

  IF pending_requests > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot delete user with pending edit requests. Please approve or reject all requests first.'
    );
  END IF;

  -- Count tasks assigned to this user
  SELECT COUNT(*) INTO task_count
  FROM task_assignees ta
  WHERE ta.user_id = soft_delete_user.user_id;

  -- Reassign tasks if requested
  IF soft_delete_user.reassign_tasks_to IS NOT NULL THEN
    -- Verify target user exists and is not deleted
    IF NOT EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = soft_delete_user.reassign_tasks_to
        AND u.deleted_at IS NULL
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Target user for reassignment not found or is deleted'
      );
    END IF;

    -- Reassign tasks
    UPDATE task_assignees ta
    SET user_id = soft_delete_user.reassign_tasks_to,
        assigned_by = soft_delete_user.deleted_by
    WHERE ta.user_id = soft_delete_user.user_id;

    GET DIAGNOSTICS reassigned_count = ROW_COUNT;
  END IF;

  -- Soft delete the user
  UPDATE users u
  SET
    deleted_at = NOW(),
    deleted_by = soft_delete_user.deleted_by,
    updated_at = NOW()
  WHERE u.id = soft_delete_user.user_id;

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

COMMENT ON FUNCTION soft_delete_user IS
  'Soft deletes a user. Only Super Admin can call this. Optionally reassigns user tasks to another user. Prevents deletion if pending edit requests exist. Fixed parameter/column ambiguity.';

