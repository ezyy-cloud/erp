-- Migration 044: Purge soft-deleted users using pg_cron
-- - Defines a helper function to hard-delete users that were soft-deleted
--   more than N days ago (default 30).
-- - Because of ON DELETE CASCADE constraints, this will also remove
--   related records such as task assignments, comments, notes, etc.
-- - Registers a daily pg_cron job to call this function.

-- Helper function: purge soft-deleted users older than N days
CREATE OR REPLACE FUNCTION purge_soft_deleted_users(
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
    FROM users
    WHERE deleted_at IS NOT NULL
      AND deleted_at < v_cutoff
    ORDER BY deleted_at
    LIMIT p_limit
  ),
  deleted AS (
    DELETE FROM users
    USING to_delete
    WHERE users.id = to_delete.id
    RETURNING users.id
  )
  SELECT COUNT(*) INTO v_deleted_count FROM deleted;

  RETURN jsonb_build_object(
    'success', true,
    'purged_users', COALESCE(v_deleted_count, 0),
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

COMMENT ON FUNCTION purge_soft_deleted_users IS
  'Hard-deletes users that were soft-deleted more than N days ago (default 30). Intended for scheduled cleanup using pg_cron.';

-- Ensure pg_cron extension is available
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Register a daily job at 03:30 UTC to purge soft-deleted users older than 30 days
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'purge_soft_deleted_users_daily'
  ) THEN
    PERFORM cron.schedule(
      'purge_soft_deleted_users_daily',
      '30 3 * * *',
      'SELECT public.purge_soft_deleted_users(30, 500);'
    );
  END IF;
END;
$$;

