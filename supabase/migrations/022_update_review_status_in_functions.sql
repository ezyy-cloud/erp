-- Migration 022: Update Review Status in Functions
-- Updates all functions to use new review status values (pending_review, under_review)

-- Update get_user_workload_summary function
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
      COUNT(t.id) FILTER (WHERE t.review_requested_by = u.id AND t.review_status IN ('pending_review', 'under_review'))::INTEGER as tasks_waiting_review
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id
    LEFT JOIN tasks t ON t.assigned_to = u.id OR t.review_requested_by = u.id
    WHERE u.is_active = true
    GROUP BY u.id, u.full_name, u.email, r.name
    ORDER BY u.full_name, u.email;
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
      COUNT(t.id) FILTER (WHERE t.review_requested_by = u.id AND t.review_status IN ('pending_review', 'under_review'))::INTEGER as tasks_waiting_review
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id
    LEFT JOIN tasks t ON t.assigned_to = u.id OR t.review_requested_by = u.id
    WHERE u.id = p_user_id AND u.is_active = true
    GROUP BY u.id, u.full_name, u.email, r.name;
  END IF;
END;
$$;

-- Update dashboard functions to use new review status values
-- These functions are in migration 010, but we update them here for consistency
-- Note: If migration 010 hasn't been run, this will create the functions

-- Update get_dashboard_stats_super_admin (if exists)
-- Drop first if it exists, then recreate with updated review status
DROP FUNCTION IF EXISTS get_dashboard_stats_super_admin(UUID);

CREATE OR REPLACE FUNCTION get_dashboard_stats_super_admin(p_user_id UUID)
RETURNS TABLE (
  total_projects INTEGER,
  total_tasks INTEGER,
  tasks_due_today INTEGER,
  overdue_tasks INTEGER,
  tasks_awaiting_review INTEGER,
  task_status_distribution JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (SELECT COUNT(*)::INTEGER FROM projects) as total_projects,
    (SELECT COUNT(*)::INTEGER FROM tasks) as total_tasks,
    (SELECT COUNT(*)::INTEGER FROM tasks WHERE due_date IS NOT NULL AND DATE(due_date) = CURRENT_DATE AND status != 'closed' AND status != 'done') as tasks_due_today,
    (SELECT COUNT(*)::INTEGER FROM tasks WHERE due_date IS NOT NULL AND due_date < NOW() AND status != 'closed' AND status != 'done') as overdue_tasks,
    (SELECT COUNT(*)::INTEGER FROM tasks WHERE review_status IN ('pending_review', 'under_review')) as tasks_awaiting_review,
    (SELECT jsonb_agg(jsonb_build_object('status', status, 'count', count))
     FROM (SELECT status, COUNT(*) as count FROM tasks GROUP BY status) sub) as task_status_distribution;
END;
$$;

-- Update get_dashboard_stats_admin (if exists)
DROP FUNCTION IF EXISTS get_dashboard_stats_admin(UUID);

CREATE OR REPLACE FUNCTION get_dashboard_stats_admin(p_user_id UUID)
RETURNS TABLE (
  active_projects INTEGER,
  tasks_due_today INTEGER,
  overdue_tasks INTEGER,
  tasks_awaiting_review INTEGER,
  recently_updated_tasks JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (SELECT COUNT(*)::INTEGER FROM projects WHERE status = 'active') as active_projects,
    (SELECT COUNT(*)::INTEGER FROM tasks WHERE due_date IS NOT NULL AND DATE(due_date) = CURRENT_DATE AND status != 'closed' AND status != 'done') as tasks_due_today,
    (SELECT COUNT(*)::INTEGER FROM tasks WHERE due_date IS NOT NULL AND due_date < NOW() AND status != 'closed' AND status != 'done') as overdue_tasks,
    (SELECT COUNT(*)::INTEGER FROM tasks WHERE review_status IN ('pending_review', 'under_review')) as tasks_awaiting_review,
    (SELECT jsonb_agg(jsonb_build_object('id', id, 'title', title, 'status', status, 'updated_at', updated_at))
     FROM (SELECT id, title, status, updated_at FROM tasks ORDER BY updated_at DESC LIMIT 5) sub) as recently_updated_tasks;
END;
$$;

-- Update get_dashboard_stats_staff (if exists)
DROP FUNCTION IF EXISTS get_dashboard_stats_staff(UUID);

CREATE OR REPLACE FUNCTION get_dashboard_stats_staff(p_user_id UUID)
RETURNS TABLE (
  my_tasks INTEGER,
  tasks_due_today INTEGER,
  overdue_tasks INTEGER,
  tasks_awaiting_action INTEGER,
  tasks_submitted_for_review INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User does not exist';
  END IF;
  
  RETURN QUERY
  SELECT 
    (SELECT COUNT(*)::INTEGER FROM tasks WHERE assigned_to = p_user_id) as my_tasks,
    (SELECT COUNT(*)::INTEGER FROM tasks WHERE assigned_to = p_user_id AND due_date IS NOT NULL AND DATE(due_date) = CURRENT_DATE AND status != 'closed' AND status != 'done') as tasks_due_today,
    (SELECT COUNT(*)::INTEGER FROM tasks WHERE assigned_to = p_user_id AND due_date IS NOT NULL AND due_date < NOW() AND status != 'closed' AND status != 'done') as overdue_tasks,
    (SELECT COUNT(*)::INTEGER FROM tasks WHERE assigned_to = p_user_id AND status NOT IN ('done', 'blocked', 'closed')) as tasks_awaiting_action,
    (SELECT COUNT(*)::INTEGER FROM tasks WHERE review_requested_by = p_user_id AND review_status IN ('pending_review', 'under_review')) as tasks_submitted_for_review;
END;
$$;
