-- Migration 051: Notify on task_assignees INSERT (multi-assignee)
-- When a user is added via task_assignees, create a task_assigned notification (in-app + email via webhook).
-- The existing create_task_assignment_notification(task_id, user_id) is reused.

CREATE OR REPLACE FUNCTION notify_task_assignee_added()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM create_task_assignment_notification(NEW.task_id, NEW.user_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS task_assignee_added_notification ON task_assignees;
CREATE TRIGGER task_assignee_added_notification
  AFTER INSERT ON task_assignees
  FOR EACH ROW
  EXECUTE FUNCTION notify_task_assignee_added();

COMMENT ON FUNCTION notify_task_assignee_added IS 'Creates task_assigned notification (and email) when a user is added to task_assignees.';
