-- Migration 020: Enhanced Dashboard Functions
-- Provides comprehensive project health and user workload data for dashboard
-- Optimized for decision-making speed and clarity

-- ============================================
-- Function: Get project health summary
-- Returns project name, status, task counts, completion percentage
-- ============================================
CREATE OR REPLACE FUNCTION get_project_health_summary(p_user_id UUID)
RETURNS TABLE (
  project_id UUID,
  project_name VARCHAR,
  project_status VARCHAR,
  total_tasks INTEGER,
  open_tasks INTEGER,
  overdue_tasks INTEGER,
  closed_tasks INTEGER,
  completion_percentage NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Super Admin and Admin see all projects
  IF EXISTS (
    SELECT 1 FROM users u
    JOIN roles r ON u.role_id = r.id
    WHERE u.id = p_user_id AND r.name IN ('super_admin', 'admin')
  ) THEN
    RETURN QUERY
    SELECT 
      p.id as project_id,
      p.name as project_name,
      p.status as project_status,
      COUNT(t.id)::INTEGER as total_tasks,
      COUNT(t.id) FILTER (WHERE t.status != 'closed' AND t.status != 'done')::INTEGER as open_tasks,
      COUNT(t.id) FILTER (WHERE t.due_date IS NOT NULL AND t.due_date < NOW() AND t.status != 'closed' AND t.status != 'done')::INTEGER as overdue_tasks,
      COUNT(t.id) FILTER (WHERE t.status = 'closed' OR t.status = 'done')::INTEGER as closed_tasks,
      CASE 
        WHEN COUNT(t.id) > 0 THEN
          ROUND((COUNT(t.id) FILTER (WHERE t.status = 'closed' OR t.status = 'done')::NUMERIC / COUNT(t.id)::NUMERIC) * 100, 1)
        ELSE 0
      END as completion_percentage
    FROM projects p
    LEFT JOIN tasks t ON t.project_id = p.id
    GROUP BY p.id, p.name, p.status
    ORDER BY 
      CASE p.status
        WHEN 'closed' THEN 2
        WHEN 'active' THEN 1
        ELSE 3
      END,
      p.name;
  -- Users see only projects they're assigned to
  ELSE
    RETURN QUERY
    SELECT 
      p.id as project_id,
      p.name as project_name,
      p.status as project_status,
      COUNT(t.id)::INTEGER as total_tasks,
      COUNT(t.id) FILTER (WHERE t.status != 'closed' AND t.status != 'done')::INTEGER as open_tasks,
      COUNT(t.id) FILTER (WHERE t.due_date IS NOT NULL AND t.due_date < NOW() AND t.status != 'closed' AND t.status != 'done')::INTEGER as overdue_tasks,
      COUNT(t.id) FILTER (WHERE t.status = 'closed' OR t.status = 'done')::INTEGER as closed_tasks,
      CASE 
        WHEN COUNT(t.id) > 0 THEN
          ROUND((COUNT(t.id) FILTER (WHERE t.status = 'closed' OR t.status = 'done')::NUMERIC / COUNT(t.id)::NUMERIC) * 100, 1)
        ELSE 0
      END as completion_percentage
    FROM projects p
    INNER JOIN tasks t ON t.project_id = p.id
    WHERE t.assigned_to = p_user_id
    GROUP BY p.id, p.name, p.status
    ORDER BY 
      CASE p.status
        WHEN 'closed' THEN 2
        WHEN 'active' THEN 1
        ELSE 3
      END,
      p.name;
  END IF;
END;
$$;

-- ============================================
-- Function: Get user workload summary
-- Returns user name, role, task counts, overdue count, review count
-- ============================================
CREATE OR REPLACE FUNCTION get_user_workload_summary(p_user_id UUID)
RETURNS TABLE (
  user_id UUID,
  user_name VARCHAR,
  user_email VARCHAR,
  user_role VARCHAR,
  assigned_tasks INTEGER,
  overdue_tasks INTEGER,
  tasks_waiting_review INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Super Admin and Admin see all users
  IF EXISTS (
    SELECT 1 FROM users u
    JOIN roles r ON u.role_id = r.id
    WHERE u.id = p_user_id AND r.name IN ('super_admin', 'admin')
  ) THEN
    RETURN QUERY
    SELECT 
      u.id as user_id,
      COALESCE(u.full_name, u.email) as user_name,
      u.email as user_email,
      r.name as user_role,
      COUNT(t.id) FILTER (WHERE t.assigned_to = u.id)::INTEGER as assigned_tasks,
      COUNT(t.id) FILTER (WHERE t.assigned_to = u.id AND t.due_date IS NOT NULL AND t.due_date < NOW() AND t.status != 'closed' AND t.status != 'done')::INTEGER as overdue_tasks,
      COUNT(t.id) FILTER (WHERE t.review_requested_by = u.id AND t.review_status = 'waiting_for_review')::INTEGER as tasks_waiting_review
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id
    LEFT JOIN tasks t ON t.assigned_to = u.id OR t.review_requested_by = u.id
    WHERE u.is_active = true
    GROUP BY u.id, u.full_name, u.email, r.name
    ORDER BY 
      COUNT(t.id) FILTER (WHERE t.assigned_to = u.id AND t.due_date IS NOT NULL AND t.due_date < NOW() AND t.status != 'closed' AND t.status != 'done') DESC,
      COUNT(t.id) FILTER (WHERE t.assigned_to = u.id) DESC;
  -- Users see only themselves
  ELSE
    RETURN QUERY
    SELECT 
      u.id as user_id,
      COALESCE(u.full_name, u.email) as user_name,
      u.email as user_email,
      r.name as user_role,
      COUNT(t.id) FILTER (WHERE t.assigned_to = u.id)::INTEGER as assigned_tasks,
      COUNT(t.id) FILTER (WHERE t.assigned_to = u.id AND t.due_date IS NOT NULL AND t.due_date < NOW() AND t.status != 'closed' AND t.status != 'done')::INTEGER as overdue_tasks,
      COUNT(t.id) FILTER (WHERE t.review_requested_by = u.id AND t.review_status = 'waiting_for_review')::INTEGER as tasks_waiting_review
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id
    LEFT JOIN tasks t ON t.assigned_to = u.id OR t.review_requested_by = u.id
    WHERE u.id = p_user_id AND u.is_active = true
    GROUP BY u.id, u.full_name, u.email, r.name;
  END IF;
END;
$$;

-- ============================================
-- Function: Get task urgency summary
-- Returns tasks grouped by urgency level and status
-- ============================================
CREATE OR REPLACE FUNCTION get_task_urgency_summary(p_user_id UUID)
RETURNS TABLE (
  status VARCHAR,
  overdue_count INTEGER,
  due_today_count INTEGER,
  due_soon_count INTEGER,
  total_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Super Admin and Admin see all tasks
  IF EXISTS (
    SELECT 1 FROM users u
    JOIN roles r ON u.role_id = r.id
    WHERE u.id = p_user_id AND r.name IN ('super_admin', 'admin')
  ) THEN
    RETURN QUERY
    SELECT 
      t.status,
      COUNT(*) FILTER (WHERE t.due_date IS NOT NULL AND t.due_date < NOW() AND t.status != 'closed' AND t.status != 'done')::INTEGER as overdue_count,
      COUNT(*) FILTER (WHERE t.due_date IS NOT NULL AND DATE(t.due_date) = CURRENT_DATE AND t.status != 'closed' AND t.status != 'done')::INTEGER as due_today_count,
      COUNT(*) FILTER (WHERE t.due_date IS NOT NULL AND t.due_date > NOW() AND t.due_date <= NOW() + INTERVAL '3 days' AND t.status != 'closed' AND t.status != 'done')::INTEGER as due_soon_count,
      COUNT(*)::INTEGER as total_count
    FROM tasks t
    WHERE t.status != 'closed' OR t.closed_reason = 'project_closed'
    GROUP BY t.status
    ORDER BY 
      CASE t.status
        WHEN 'blocked' THEN 1
        WHEN 'in_progress' THEN 2
        WHEN 'to_do' THEN 3
        WHEN 'done' THEN 4
        WHEN 'closed' THEN 5
        ELSE 6
      END;
  -- Users see only their tasks
  ELSE
    RETURN QUERY
    SELECT 
      t.status,
      COUNT(*) FILTER (WHERE t.due_date IS NOT NULL AND t.due_date < NOW() AND t.status != 'closed' AND t.status != 'done')::INTEGER as overdue_count,
      COUNT(*) FILTER (WHERE t.due_date IS NOT NULL AND DATE(t.due_date) = CURRENT_DATE AND t.status != 'closed' AND t.status != 'done')::INTEGER as due_today_count,
      COUNT(*) FILTER (WHERE t.due_date IS NOT NULL AND t.due_date > NOW() AND t.due_date <= NOW() + INTERVAL '3 days' AND t.status != 'closed' AND t.status != 'done')::INTEGER as due_soon_count,
      COUNT(*)::INTEGER as total_count
    FROM tasks t
    WHERE t.assigned_to = p_user_id
      AND (t.status != 'closed' OR t.closed_reason = 'project_closed')
    GROUP BY t.status
    ORDER BY 
      CASE t.status
        WHEN 'blocked' THEN 1
        WHEN 'in_progress' THEN 2
        WHEN 'to_do' THEN 3
        WHEN 'done' THEN 4
        WHEN 'closed' THEN 5
        ELSE 6
      END;
  END IF;
END;
$$;

-- Add comments for documentation
COMMENT ON FUNCTION get_project_health_summary IS 'Returns project health metrics: task counts, completion percentage, overdue tasks. Role-aware.';
COMMENT ON FUNCTION get_user_workload_summary IS 'Returns user workload snapshot: assigned tasks, overdue count, tasks waiting review. Sorted by urgency.';
COMMENT ON FUNCTION get_task_urgency_summary IS 'Returns task counts grouped by status with urgency breakdown (overdue, due today, due soon).';
