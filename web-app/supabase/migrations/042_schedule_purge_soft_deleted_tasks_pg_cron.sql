-- Migration 042: Schedule purge of soft-deleted tasks using pg_cron
-- - Ensures pg_cron extension is available
-- - Registers a daily job to purge tasks soft-deleted more than 30 days ago
-- - Uses the existing public.purge_soft_deleted_tasks(p_cutoff_days, p_limit) function

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Register a daily job at 03:00 UTC to purge soft-deleted tasks older than 30 days
-- Guarded so we don't create duplicate jobs on repeated migrations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'purge_soft_deleted_tasks_daily'
  ) THEN
    PERFORM cron.schedule(
      'purge_soft_deleted_tasks_daily',
      '0 3 * * *',
      'SELECT public.purge_soft_deleted_tasks(30, 500);'
    );
  END IF;
END;
$$;

