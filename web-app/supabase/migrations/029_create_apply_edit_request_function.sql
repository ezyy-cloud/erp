-- Migration 029: Create Apply Edit Request Function
-- Database function to apply approved edit requests to tasks
-- Only Super Admin can call this function
-- Handles all field updates including multi-assignee changes

CREATE OR REPLACE FUNCTION apply_task_edit_request(
  request_id UUID,
  reviewed_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  edit_request RECORD;
  task_record RECORD;
  proposed_changes JSONB;
  assignee_ids UUID[];
  assignee_id UUID;
  current_assignees UUID[];
  new_assignee_id UUID;
BEGIN
  -- Validate that reviewer is Super Admin
  IF NOT public.user_has_role(ARRAY['super_admin']) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Only Super Admin can approve edit requests'
    );
  END IF;

  -- Fetch the edit request
  SELECT * INTO edit_request
  FROM task_edit_requests
  WHERE id = request_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Edit request not found'
    );
  END IF;

  -- Check if request is pending
  IF edit_request.status != 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Edit request is not pending'
    );
  END IF;

  -- Fetch the task
  SELECT * INTO task_record
  FROM tasks
  WHERE id = edit_request.task_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Task not found'
    );
  END IF;

  -- Check if task is soft-deleted
  IF task_record.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot edit soft-deleted task'
    );
  END IF;

  -- Get proposed changes
  proposed_changes := edit_request.proposed_changes;

  -- Temporarily disable the immutability trigger
  -- We need to bypass it for approved edit requests
  -- This is safe because we've validated Super Admin role
  ALTER TABLE tasks DISABLE TRIGGER enforce_task_immutability;

  -- Apply changes to task
  UPDATE tasks
  SET
    title = COALESCE(proposed_changes->>'title', title),
    description = COALESCE(proposed_changes->>'description', description),
    due_date = CASE 
      WHEN proposed_changes->>'due_date' IS NOT NULL 
      THEN (proposed_changes->>'due_date')::timestamptz
      ELSE due_date
    END,
    priority = COALESCE(proposed_changes->>'priority', priority),
    updated_at = NOW()
  WHERE id = edit_request.task_id;

  -- Re-enable the trigger
  ALTER TABLE tasks ENABLE TRIGGER enforce_task_immutability;

  -- Handle assignee changes if present
  IF proposed_changes ? 'assignees' THEN
    -- Get current assignees
    SELECT ARRAY_AGG(user_id) INTO current_assignees
    FROM task_assignees
    WHERE task_id = edit_request.task_id;

    -- Get new assignees from JSONB array
    assignee_ids := ARRAY(
      SELECT jsonb_array_elements_text(proposed_changes->'assignees')
    )::UUID[];

    -- Remove assignees that are not in the new list
    DELETE FROM task_assignees
    WHERE task_id = edit_request.task_id
    AND user_id != ALL(assignee_ids);

    -- Add new assignees that are not already assigned
    FOREACH new_assignee_id IN ARRAY assignee_ids
    LOOP
      INSERT INTO task_assignees (task_id, user_id, assigned_by)
      VALUES (edit_request.task_id, new_assignee_id, reviewed_by)
      ON CONFLICT (task_id, user_id) DO NOTHING;
    END LOOP;
  END IF;

  -- Update edit request status
  UPDATE task_edit_requests
  SET
    status = 'approved',
    reviewed_by = reviewed_by,
    reviewed_at = NOW(),
    updated_at = NOW()
  WHERE id = request_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Edit request applied successfully'
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Re-enable trigger in case of error
    ALTER TABLE tasks ENABLE TRIGGER enforce_task_immutability;
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- Grant execute permission to authenticated users
-- (RLS and function logic will enforce Super Admin requirement)
GRANT EXECUTE ON FUNCTION apply_task_edit_request(UUID, UUID) TO authenticated;

-- Add comment
COMMENT ON FUNCTION apply_task_edit_request IS 'Applies an approved edit request to a task. Only Super Admin can call this function.';
