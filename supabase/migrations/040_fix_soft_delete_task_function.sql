-- Migration 040: Fix soft_delete_task function ambiguity
-- - Avoids ambiguous task_id/deleted_by references by qualifying column references
-- - Keeps parameter names and order compatible with Supabase schema cache
-- - Ensures deleted_by is correctly recorded on soft delete

-- Drop the existing function definition so we can safely update the body
DROP FUNCTION IF EXISTS soft_delete_task(UUID, UUID);

CREATE FUNCTION soft_delete_task(
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
  WHERE id = soft_delete_task.task_id;

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
  FROM task_edit_requests ter
  WHERE ter.task_id = soft_delete_task.task_id
    AND ter.status = 'pending';

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
    deleted_by = soft_delete_task.deleted_by,
    updated_at = NOW()
  WHERE id = soft_delete_task.task_id;

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

-- Ensure authenticated users can still execute this function
GRANT EXECUTE ON FUNCTION soft_delete_task(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION soft_delete_task IS 'Soft deletes a task. Only Super Admin can call this. Prevents deletion if pending edit requests exist. Fixed parameter naming to avoid ambiguity.';

