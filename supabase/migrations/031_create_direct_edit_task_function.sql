-- Migration 031: Create Direct Edit Task Function for Super Admins
-- Allows Super Admins to edit tasks directly while maintaining full audit trail
-- Automatically creates an approved edit request record for audit purposes

CREATE OR REPLACE FUNCTION public.direct_edit_task(
  p_task_id UUID,
  p_edited_by UUID,
  p_changes JSONB,
  p_comments TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task tasks;
  v_new_title TEXT;
  v_new_description TEXT;
  v_new_due_date TIMESTAMPTZ;
  v_new_priority VARCHAR(20);
  v_new_assignees UUID[];
  v_assignee_id UUID;
  v_current_assignees UUID[];
BEGIN
  -- Validate that editor is Super Admin
  IF NOT public.user_has_role(ARRAY['super_admin']) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Only Super Admin can directly edit tasks'
    );
  END IF;

  -- Fetch the task
  SELECT * INTO v_task
  FROM tasks
  WHERE id = p_task_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Task not found'
    );
  END IF;

  -- Check if task is soft-deleted
  IF v_task.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot edit soft-deleted task'
    );
  END IF;

  -- Extract changes from JSONB
  v_new_title := p_changes->>'title';
  v_new_description := p_changes->>'description';
  v_new_due_date := (p_changes->>'due_date')::TIMESTAMPTZ;
  v_new_priority := p_changes->>'priority';
  
  -- Extract assignees array if provided
  IF p_changes->'assignees' IS NOT NULL THEN
    SELECT ARRAY(
      SELECT jsonb_array_elements_text(p_changes->'assignees')::UUID
    ) INTO v_new_assignees;
  END IF;

  -- Temporarily disable immutability trigger
  ALTER TABLE tasks DISABLE TRIGGER enforce_task_immutability;

  -- Apply changes to task
  UPDATE tasks
  SET
    title = COALESCE(v_new_title, v_task.title),
    description = COALESCE(v_new_description, v_task.description),
    due_date = COALESCE(v_new_due_date, v_task.due_date),
    priority = COALESCE(v_new_priority, v_task.priority),
    updated_at = NOW()
  WHERE id = p_task_id;

  -- Update assignees if provided
  IF v_new_assignees IS NOT NULL THEN
    -- Get current assignees
    SELECT ARRAY_AGG(user_id) INTO v_current_assignees
    FROM task_assignees
    WHERE task_id = p_task_id;

    -- Delete assignees that are no longer in the new list
    DELETE FROM task_assignees
    WHERE task_id = p_task_id
    AND user_id = ANY(COALESCE(v_current_assignees, ARRAY[]::UUID[]))
    AND NOT (user_id = ANY(v_new_assignees));

    -- Insert new assignees that are not already present
    FOREACH v_assignee_id IN ARRAY v_new_assignees
    LOOP
      INSERT INTO task_assignees (task_id, user_id, assigned_by)
      VALUES (p_task_id, v_assignee_id, p_edited_by)
      ON CONFLICT (task_id, user_id) DO UPDATE
      SET assigned_by = p_edited_by;
    END LOOP;
  END IF;

  -- Re-enable trigger
  ALTER TABLE tasks ENABLE TRIGGER enforce_task_immutability;

  -- Create audit record (auto-approved edit request for audit trail)
  INSERT INTO task_edit_requests (
    task_id,
    requested_by,
    proposed_changes,
    status,
    reviewed_by,
    reviewed_at,
    comments
  ) VALUES (
    p_task_id,
    p_edited_by,
    p_changes,
    'approved',
    p_edited_by,
    NOW(),
    COALESCE(p_comments, 'Direct edit by Super Admin')
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Task edited successfully'
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
GRANT EXECUTE ON FUNCTION public.direct_edit_task(UUID, UUID, JSONB, TEXT) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION direct_edit_task IS 'Allows Super Admin to directly edit tasks while maintaining full audit trail. Creates an auto-approved edit request record for compliance.';
