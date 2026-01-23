-- Migration 034: User Performance Metrics
-- Implements comprehensive performance analytics for user management
-- Provides aggregated metrics, productivity scores, and comparative analytics

-- ============================================
-- 1. Helper Function: Get User Task Counts
-- ============================================
CREATE OR REPLACE FUNCTION public.get_user_task_counts(
  p_user_id UUID
)
RETURNS TABLE(
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

  -- Count completed tasks (status = 'done' or 'closed', and archived_at IS NOT NULL means closed)
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
    AND (
      (t.status = 'done' AND t.archived_at IS NULL) -- Done but not yet archived
      OR (t.archived_at IS NOT NULL) -- Archived/closed
    );

  -- Count pending tasks (status = 'to_do')
  SELECT COUNT(DISTINCT t.id) INTO v_total_pending
  FROM tasks t
  WHERE t.deleted_at IS NULL
    AND t.archived_at IS NULL
    AND t.status = 'to_do'
    AND (
      EXISTS (
        SELECT 1 FROM task_assignees ta
        WHERE ta.task_id = t.id
        AND ta.user_id = p_user_id
      )
      OR t.assigned_to = p_user_id
    );

  -- Count in progress tasks
  SELECT COUNT(DISTINCT t.id) INTO v_total_in_progress
  FROM tasks t
  WHERE t.deleted_at IS NULL
    AND t.archived_at IS NULL
    AND t.status = 'in_progress'
    AND (
      EXISTS (
        SELECT 1 FROM task_assignees ta
        WHERE ta.task_id = t.id
        AND ta.user_id = p_user_id
      )
      OR t.assigned_to = p_user_id
    );

  -- Count pending review tasks
  SELECT COUNT(DISTINCT t.id) INTO v_total_pending_review
  FROM tasks t
  WHERE t.deleted_at IS NULL
    AND t.archived_at IS NULL
    AND t.status = 'done'
    AND t.review_status IN ('pending_review', 'under_review')
    AND (
      EXISTS (
        SELECT 1 FROM task_assignees ta
        WHERE ta.task_id = t.id
        AND ta.user_id = p_user_id
      )
      OR t.assigned_to = p_user_id
    );

  -- Count archived/closed tasks
  SELECT COUNT(DISTINCT t.id) INTO v_total_archived
  FROM tasks t
  WHERE t.deleted_at IS NULL
    AND t.archived_at IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM task_assignees ta
        WHERE ta.task_id = t.id
        AND ta.user_id = p_user_id
      )
      OR t.assigned_to = p_user_id
    );

  -- Calculate completion rate (completed / total assigned, excluding pending)
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

-- ============================================
-- 2. Function: Get User Performance Summary
-- ============================================
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
  v_timeliness_rate NUMERIC := 0;
  v_review_approval_rate NUMERIC := 0;
  v_reviewed_count BIGINT := 0;
  v_approved_count BIGINT := 0;
  v_this_week_completed BIGINT := 0;
  v_last_week_completed BIGINT := 0;
  v_week_over_week_change NUMERIC := 0;
  v_result JSONB;
BEGIN
  -- Get task counts
  SELECT * INTO v_task_counts
  FROM public.get_user_task_counts(p_user_id);

  -- Calculate average completion time (for completed tasks)
  -- This is the time from creation to when status changed to 'done' or archived
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
    AND (
      (t.status = 'done' AND t.archived_at IS NULL)
      OR t.archived_at IS NOT NULL
    );

  -- Count on-time vs overdue tasks
  -- On-time: completed before or on due_date
  SELECT COUNT(DISTINCT t.id) INTO v_on_time_count
  FROM tasks t
  WHERE t.deleted_at IS NULL
    AND t.due_date IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM task_assignees ta
        WHERE ta.task_id = t.id
        AND ta.user_id = p_user_id
      )
      OR t.assigned_to = p_user_id
    )
    AND (
      (t.status = 'done' AND t.archived_at IS NULL)
      OR t.archived_at IS NOT NULL
    )
    AND (
      COALESCE(t.archived_at, t.updated_at) <= t.due_date
    );

  -- Overdue: completed after due_date
  SELECT COUNT(DISTINCT t.id) INTO v_overdue_count
  FROM tasks t
  WHERE t.deleted_at IS NULL
    AND t.due_date IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM task_assignees ta
        WHERE ta.task_id = t.id
        AND ta.user_id = p_user_id
      )
      OR t.assigned_to = p_user_id
    )
    AND (
      (t.status = 'done' AND t.archived_at IS NULL)
      OR t.archived_at IS NOT NULL
    )
    AND (
      COALESCE(t.archived_at, t.updated_at) > t.due_date
    );

  -- Calculate timeliness rate
  IF (v_on_time_count + v_overdue_count) > 0 THEN
    v_timeliness_rate := ROUND((v_on_time_count::NUMERIC / (v_on_time_count + v_overdue_count)::NUMERIC) * 100, 2);
  END IF;

  -- Calculate review approval rate
  SELECT COUNT(DISTINCT t.id) INTO v_reviewed_count
  FROM tasks t
  WHERE t.deleted_at IS NULL
    AND t.review_status IN ('reviewed_approved', 'changes_requested')
    AND (
      EXISTS (
        SELECT 1 FROM task_assignees ta
        WHERE ta.task_id = t.id
        AND ta.user_id = p_user_id
      )
      OR t.assigned_to = p_user_id
    );

  SELECT COUNT(DISTINCT t.id) INTO v_approved_count
  FROM tasks t
  WHERE t.deleted_at IS NULL
    AND t.review_status = 'reviewed_approved'
    AND (
      EXISTS (
        SELECT 1 FROM task_assignees ta
        WHERE ta.task_id = t.id
        AND ta.user_id = p_user_id
      )
      OR t.assigned_to = p_user_id
    );

  IF v_reviewed_count > 0 THEN
    v_review_approval_rate := ROUND((v_approved_count::NUMERIC / v_reviewed_count::NUMERIC) * 100, 2);
  END IF;

  -- Calculate weekly completion stats
  -- This week (Monday to Sunday of current week)
  SELECT COUNT(DISTINCT t.id) INTO v_this_week_completed
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
    AND (
      (t.status = 'done' AND t.archived_at IS NULL AND t.updated_at >= date_trunc('week', CURRENT_DATE))
      OR (t.archived_at IS NOT NULL AND t.archived_at >= date_trunc('week', CURRENT_DATE))
    );

  -- Last week
  SELECT COUNT(DISTINCT t.id) INTO v_last_week_completed
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
    AND (
      (t.status = 'done' AND t.archived_at IS NULL 
        AND t.updated_at >= date_trunc('week', CURRENT_DATE) - INTERVAL '1 week'
        AND t.updated_at < date_trunc('week', CURRENT_DATE))
      OR (t.archived_at IS NOT NULL 
        AND t.archived_at >= date_trunc('week', CURRENT_DATE) - INTERVAL '1 week'
        AND t.archived_at < date_trunc('week', CURRENT_DATE))
    );

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

-- ============================================
-- 3. Function: Get Weekly Trend Data
-- ============================================
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

    -- Count completed tasks in this week
    SELECT COUNT(DISTINCT t.id) INTO v_completed_count
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
      AND (
        (t.status = 'done' AND t.archived_at IS NULL 
          AND t.updated_at >= v_week_start
          AND t.updated_at < v_week_end + INTERVAL '1 day')
        OR (t.archived_at IS NOT NULL 
          AND t.archived_at >= v_week_start
          AND t.archived_at < v_week_end + INTERVAL '1 day')
      );

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
-- 4. Function: Calculate Productivity Score
-- ============================================
CREATE OR REPLACE FUNCTION public.calculate_productivity_score(
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_performance JSONB;
  v_task_counts RECORD;
  v_completion_rate NUMERIC := 0;
  v_timeliness_rate NUMERIC := 0;
  v_consistency_score NUMERIC := 0;
  v_review_approval_rate NUMERIC := 0;
  v_productivity_score NUMERIC := 0;
  v_weekly_trends JSONB;
  v_weeks_with_activity INTEGER := 0;
  v_total_weeks INTEGER := 8;
  v_result JSONB;
BEGIN
  -- Get performance summary
  SELECT public.get_user_performance_summary(p_user_id) INTO v_performance;

  -- Get task counts
  SELECT * INTO v_task_counts
  FROM public.get_user_task_counts(p_user_id);

  -- Extract metrics
  v_completion_rate := COALESCE((v_performance->'task_counts'->>'completion_rate')::NUMERIC, 0);
  v_timeliness_rate := COALESCE((v_performance->'timeliness'->>'timeliness_rate')::NUMERIC, 0);
  v_review_approval_rate := COALESCE((v_performance->'review_metrics'->>'approval_rate')::NUMERIC, 0);

  -- Calculate consistency (weeks with activity in last 8 weeks)
  SELECT public.get_user_weekly_trends(p_user_id, 8) INTO v_weekly_trends;
  
  SELECT COUNT(*) INTO v_weeks_with_activity
  FROM jsonb_array_elements(v_weekly_trends) week
  WHERE (week->>'completed_count')::BIGINT > 0;

  -- Consistency score: percentage of weeks with activity
  IF v_total_weeks > 0 THEN
    v_consistency_score := (v_weeks_with_activity::NUMERIC / v_total_weeks::NUMERIC) * 100;
  END IF;

  -- Calculate weighted productivity score
  -- Weights: Completion Rate (40%), Timeliness (30%), Consistency (20%), Review Approval (10%)
  v_productivity_score := 
    (v_completion_rate * 0.40) +
    (v_timeliness_rate * 0.30) +
    (v_consistency_score * 0.20) +
    (v_review_approval_rate * 0.10);

  -- Normalize to 0-100
  v_productivity_score := LEAST(100, GREATEST(0, ROUND(v_productivity_score, 2)));

  -- Build result with breakdown
  v_result := jsonb_build_object(
    'productivity_score', v_productivity_score,
    'breakdown', jsonb_build_object(
      'completion_rate', jsonb_build_object(
        'value', v_completion_rate,
        'weight', 40,
        'contribution', ROUND(v_completion_rate * 0.40, 2)
      ),
      'timeliness', jsonb_build_object(
        'value', v_timeliness_rate,
        'weight', 30,
        'contribution', ROUND(v_timeliness_rate * 0.30, 2)
      ),
      'consistency', jsonb_build_object(
        'value', v_consistency_score,
        'weight', 20,
        'contribution', ROUND(v_consistency_score * 0.20, 2)
      ),
      'review_approval', jsonb_build_object(
        'value', v_review_approval_rate,
        'weight', 10,
        'contribution', ROUND(v_review_approval_rate * 0.10, 2)
      )
    )
  );

  RETURN v_result;
END;
$$;

-- ============================================
-- 5. Function: Get All Users Performance (for comparative analytics)
-- ============================================
CREATE OR REPLACE FUNCTION public.get_all_users_performance()
RETURNS TABLE(
  user_id UUID,
  user_email TEXT,
  user_full_name TEXT,
  productivity_score NUMERIC,
  total_assigned BIGINT,
  total_completed BIGINT,
  completion_rate NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id AS user_id,
    u.email::TEXT AS user_email,
    u.full_name::TEXT AS user_full_name,
    COALESCE((ps.score->>'productivity_score')::NUMERIC, 0) AS productivity_score,
    tc.total_assigned,
    tc.total_completed,
    tc.completion_rate
  FROM users u
  LEFT JOIN LATERAL (
    SELECT * FROM public.get_user_task_counts(u.id)
  ) tc ON true
  LEFT JOIN LATERAL (
    SELECT public.calculate_productivity_score(u.id) AS score
  ) ps ON true
  WHERE u.deleted_at IS NULL
    AND u.is_active = true
  ORDER BY productivity_score DESC NULLS LAST;
END;
$$;

-- ============================================
-- 6. Grant Permissions
-- ============================================
GRANT EXECUTE ON FUNCTION public.get_user_task_counts(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_performance_summary(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_weekly_trends(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_productivity_score(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_users_performance() TO authenticated;

-- ============================================
-- 7. Add Comments for Documentation
-- ============================================
COMMENT ON FUNCTION public.get_user_task_counts IS 'Returns aggregated task counts for a user (assigned, completed, pending, etc.)';
COMMENT ON FUNCTION public.get_user_performance_summary IS 'Returns comprehensive performance metrics for a user including completion rates, timeliness, and weekly stats';
COMMENT ON FUNCTION public.get_user_weekly_trends IS 'Returns weekly completion trends for a user over specified number of weeks';
COMMENT ON FUNCTION public.calculate_productivity_score IS 'Calculates weighted productivity score (0-100) based on completion rate, timeliness, consistency, and review approval';
COMMENT ON FUNCTION public.get_all_users_performance IS 'Returns performance metrics for all active users (for comparative analytics - admin/super admin only)';
