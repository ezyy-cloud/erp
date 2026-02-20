-- Migration 057: Fix Review Completed Notifications (Approval & Rejection)
-- Fixes:
--   1. Rejection notifications were silently broken: reject_review_and_reopen clears
--      review_requested_by before calling create_review_completed_notification, which
--      then reads NULL and returns without sending any notification.
--   2. Both approval and rejection only notified review_requested_by (one person).
--      Now notifies ALL task assignees (via task_assignees + legacy assigned_to).

CREATE OR REPLACE FUNCTION create_review_completed_notification(
  p_task_id UUID,
  p_reviewed_by UUID,
  p_status TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task_title VARCHAR(255);
  v_message TEXT;
  v_title TEXT;
  v_user_ids UUID[];
  v_user_id UUID;
BEGIN
  SELECT title INTO v_task_title
  FROM tasks
  WHERE id = p_task_id;

  IF p_status = 'reviewed_approved' THEN
    v_title := 'Task Approved';
    v_message := 'Task "' || COALESCE(v_task_title, 'Untitled Task') || '" has been approved and closed';
  ELSIF p_status = 'changes_requested' THEN
    v_title := 'Changes Requested';
    v_message := 'Changes have been requested for task "' || COALESCE(v_task_title, 'Untitled Task') || '"';
  ELSE
    RETURN NULL;
  END IF;

  WITH users_to_notify AS (
    SELECT DISTINCT u.id
    FROM users u
    WHERE u.deleted_at IS NULL
      AND u.is_active = true
      AND u.id != p_reviewed_by
      AND (
        EXISTS (
          SELECT 1 FROM task_assignees ta
          WHERE ta.task_id = p_task_id AND ta.user_id = u.id
        )
        OR u.id = (SELECT assigned_to FROM tasks WHERE id = p_task_id)
      )
  )
  SELECT ARRAY_AGG(id) INTO v_user_ids FROM users_to_notify;

  IF v_user_ids IS NOT NULL THEN
    FOREACH v_user_id IN ARRAY v_user_ids
    LOOP
      INSERT INTO notifications (
        recipient_user_id, type, title, message,
        related_entity_type, related_entity_id
      ) VALUES (
        v_user_id,
        'review_completed',
        v_title,
        v_message,
        'task',
        p_task_id
      );
    END LOOP;
  END IF;

  RETURN NULL;
END;
$$;
