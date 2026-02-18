-- Migration 010: Dashboard Aggregate Functions
-- Efficient RPC functions for role-specific dashboard statistics

-- Function: Get dashboard stats for super admin
CREATE OR REPLACE FUNCTION get_dashboard_stats_super_admin(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
  v_total_projects INTEGER;
  v_total_tasks INTEGER;
  v_tasks_due_today INTEGER;
  v_overdue_tasks INTEGER;
  v_tasks_awaiting_review INTEGER;
  v_status_distribution JSON;
BEGIN
  -- Verify user is super_admin
  IF NOT EXISTS (
    SELECT 1 FROM users u
    JOIN roles r ON u.role_id = r.id
    WHERE u.id = p_user_id AND r.name = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'User is not a super admin';
  END IF;
  
  -- Total projects
  SELECT COUNT(*) INTO v_total_projects
  FROM projects;
  
  -- Total tasks
  SELECT COUNT(*) INTO v_total_tasks
  FROM tasks;
  
  -- Tasks due today
  SELECT COUNT(*) INTO v_tasks_due_today
  FROM tasks
  WHERE due_date IS NOT NULL
    AND DATE(due_date) = CURRENT_DATE
    AND status != 'done';
  
  -- Overdue tasks
  SELECT COUNT(*) INTO v_overdue_tasks
  FROM tasks
  WHERE due_date IS NOT NULL
    AND due_date < NOW()
    AND status != 'done';
  
  -- Tasks awaiting review
  SELECT COUNT(*) INTO v_tasks_awaiting_review
  FROM tasks
  WHERE review_status = 'waiting_for_review';
  
  -- Task status distribution
  SELECT json_agg(
    json_build_object(
      'status', status,
      'count', count
    )
  ) INTO v_status_distribution
  FROM (
    SELECT status, COUNT(*) as count
    FROM tasks
    GROUP BY status
  ) status_counts;
  
  -- Build result
  v_result := json_build_object(
    'total_projects', v_total_projects,
    'total_tasks', v_total_tasks,
    'tasks_due_today', v_tasks_due_today,
    'overdue_tasks', v_overdue_tasks,
    'tasks_awaiting_review', v_tasks_awaiting_review,
    'task_status_distribution', COALESCE(v_status_distribution, '[]'::json)
  );
  
  RETURN v_result;
END;
$$;

-- Function: Get dashboard stats for admin
CREATE OR REPLACE FUNCTION get_dashboard_stats_admin(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
  v_active_projects INTEGER;
  v_tasks_due_today INTEGER;
  v_overdue_tasks INTEGER;
  v_tasks_awaiting_review INTEGER;
  v_recently_updated_tasks JSON;
BEGIN
  -- Verify user is admin
  IF NOT EXISTS (
    SELECT 1 FROM users u
    JOIN roles r ON u.role_id = r.id
    WHERE u.id = p_user_id AND r.name = 'admin'
  ) THEN
    RAISE EXCEPTION 'User is not an admin';
  END IF;
  
  -- Active projects
  SELECT COUNT(*) INTO v_active_projects
  FROM projects
  WHERE status = 'active';
  
  -- Tasks due today
  SELECT COUNT(*) INTO v_tasks_due_today
  FROM tasks
  WHERE due_date IS NOT NULL
    AND DATE(due_date) = CURRENT_DATE
    AND status != 'done';
  
  -- Overdue tasks
  SELECT COUNT(*) INTO v_overdue_tasks
  FROM tasks
  WHERE due_date IS NOT NULL
    AND due_date < NOW()
    AND status != 'done';
  
  -- Tasks awaiting review
  SELECT COUNT(*) INTO v_tasks_awaiting_review
  FROM tasks
  WHERE review_status = 'waiting_for_review';
  
  -- Recently updated tasks (last 10)
  SELECT json_agg(
    json_build_object(
      'id', id,
      'title', title,
      'status', status,
      'updated_at', updated_at
    )
    ORDER BY updated_at DESC
  ) INTO v_recently_updated_tasks
  FROM (
    SELECT id, title, status, updated_at
    FROM tasks
    ORDER BY updated_at DESC
    LIMIT 10
  ) recent_tasks;
  
  -- Build result
  v_result := json_build_object(
    'active_projects', v_active_projects,
    'tasks_due_today', v_tasks_due_today,
    'overdue_tasks', v_overdue_tasks,
    'tasks_awaiting_review', v_tasks_awaiting_review,
    'recently_updated_tasks', COALESCE(v_recently_updated_tasks, '[]'::json)
  );
  
  RETURN v_result;
END;
$$;

-- Function: Get dashboard stats for staff
CREATE OR REPLACE FUNCTION get_dashboard_stats_staff(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
  v_my_tasks INTEGER;
  v_tasks_due_today INTEGER;
  v_overdue_tasks INTEGER;
  v_tasks_awaiting_action INTEGER;
  v_tasks_submitted_for_review INTEGER;
BEGIN
  -- Verify user exists
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User does not exist';
  END IF;
  
  -- My tasks (assigned to me)
  SELECT COUNT(*) INTO v_my_tasks
  FROM tasks
  WHERE assigned_to = p_user_id;
  
  -- Tasks due today (assigned to me)
  SELECT COUNT(*) INTO v_tasks_due_today
  FROM tasks
  WHERE assigned_to = p_user_id
    AND due_date IS NOT NULL
    AND DATE(due_date) = CURRENT_DATE
    AND status != 'done';
  
  -- Overdue tasks (assigned to me)
  SELECT COUNT(*) INTO v_overdue_tasks
  FROM tasks
  WHERE assigned_to = p_user_id
    AND due_date IS NOT NULL
    AND due_date < NOW()
    AND status != 'done';
  
  -- Tasks awaiting my action (assigned to me, not done, not blocked)
  SELECT COUNT(*) INTO v_tasks_awaiting_action
  FROM tasks
  WHERE assigned_to = p_user_id
    AND status NOT IN ('done', 'blocked');
  
  -- Tasks I submitted for review
  SELECT COUNT(*) INTO v_tasks_submitted_for_review
  FROM tasks
  WHERE review_requested_by = p_user_id
    AND review_status = 'waiting_for_review';
  
  -- Build result
  v_result := json_build_object(
    'my_tasks', v_my_tasks,
    'tasks_due_today', v_tasks_due_today,
    'overdue_tasks', v_overdue_tasks,
    'tasks_awaiting_action', v_tasks_awaiting_action,
    'tasks_submitted_for_review', v_tasks_submitted_for_review
  );
  
  RETURN v_result;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_dashboard_stats_super_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_dashboard_stats_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_dashboard_stats_staff(UUID) TO authenticated;
