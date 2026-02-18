-- Migration 041: Purge soft-deleted tasks after retention period
-- - Defines a helper function to hard-delete tasks that were soft-deleted
--   more than N days ago (default 30).
-- - Because of ON DELETE CASCADE constraints, this will also remove
--   related records such as comments, notes, files, assignees, progress logs, etc.
-- - Intended to be called from a scheduled job using the service role,
--   not directly from the client.

CREATE OR REPLACE FUNCTION purge_soft_deleted_tasks(
  p_cutoff_days INTEGER DEFAULT 30,
  p_limit INTEGER DEFAULT 500
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_cutoff TIMESTAMPTZ := NOW() - (p_cutoff_days || ' days')::INTERVAL;
  v_deleted_count INTEGER := 0;
BEGIN
  WITH to_delete AS (
    SELECT id
    FROM tasks
    WHERE deleted_at IS NOT NULL
      AND deleted_at < v_cutoff
    ORDER BY deleted_at
    LIMIT p_limit
  ),
  deleted AS (
    DELETE FROM tasks
    USING to_delete
    WHERE tasks.id = to_delete.id
    RETURNING tasks.id
  )
  SELECT COUNT(*) INTO v_deleted_count FROM deleted;

  RETURN jsonb_build_object(
    'success', true,
    'purged_tasks', COALESCE(v_deleted_count, 0),
    'cutoff_days', p_cutoff_days
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION purge_soft_deleted_tasks IS
  'Hard-deletes tasks that were soft-deleted more than N days ago (default 30). Intended for scheduled cleanup using the service role.';

