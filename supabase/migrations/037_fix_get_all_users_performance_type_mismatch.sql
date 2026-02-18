-- Fix type mismatch in get_all_users_performance function
-- The function declares TEXT return types but the actual columns are VARCHAR(255)
-- This migration casts the columns to TEXT to match the function signature

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
