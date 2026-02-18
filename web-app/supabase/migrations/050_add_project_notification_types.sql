-- Migration 050: Add Project Change Notification Types and RPC
-- Enables in-app and email notifications when a project is updated, closed, or reopened.
-- Recipients are project members (excluding the user who made the change).

-- ============================================
-- 1. Update Notification Type Constraint
-- ============================================

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'task_assigned',
    'task_due_soon',
    'task_overdue',
    'review_requested',
    'review_completed',
    'comment_added',
    'document_uploaded',
    'todo_completed',
    'bulletin_posted',
    'project_updated',
    'project_closed',
    'project_reopened'
  ));

COMMENT ON COLUMN notifications.type IS 'Notification type: includes task_*, review_*, comment_added, document_uploaded, todo_completed, bulletin_posted, project_updated, project_closed, project_reopened';

-- ============================================
-- 2. RPC: Create project change notifications for all project members
-- ============================================

CREATE OR REPLACE FUNCTION public.create_project_change_notification(
  p_project_id UUID,
  p_change_type TEXT,
  p_changed_by UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_name TEXT;
  v_title TEXT;
  v_message TEXT;
  v_member_record RECORD;
BEGIN
  IF p_change_type NOT IN ('project_updated', 'project_closed', 'project_reopened') THEN
    RAISE EXCEPTION 'Invalid change_type. Must be project_updated, project_closed, or project_reopened.';
  END IF;

  SELECT name INTO v_project_name
  FROM projects
  WHERE id = p_project_id;

  IF v_project_name IS NULL THEN
    RAISE EXCEPTION 'Project not found.';
  END IF;

  v_title := CASE p_change_type
    WHEN 'project_updated' THEN 'Project Updated'
    WHEN 'project_closed' THEN 'Project Closed'
    WHEN 'project_reopened' THEN 'Project Reopened'
    ELSE 'Project Change'
  END;

  v_message := CASE p_change_type
    WHEN 'project_updated' THEN 'Project "' || v_project_name || '" was updated.'
    WHEN 'project_closed' THEN 'Project "' || v_project_name || '" was closed.'
    WHEN 'project_reopened' THEN 'Project "' || v_project_name || '" was reopened.'
    ELSE 'Project "' || v_project_name || '" has changed.'
  END;

  FOR v_member_record IN
    SELECT pm.user_id
    FROM project_members pm
    JOIN users u ON u.id = pm.user_id
    WHERE pm.project_id = p_project_id
      AND (u.deleted_at IS NULL AND u.is_active = true)
      AND (p_changed_by IS NULL OR pm.user_id != p_changed_by)
  LOOP
    INSERT INTO notifications (
      recipient_user_id,
      type,
      title,
      message,
      related_entity_type,
      related_entity_id
    ) VALUES (
      v_member_record.user_id,
      p_change_type,
      v_title,
      v_message,
      'project',
      p_project_id
    );
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_project_change_notification(UUID, TEXT, UUID) TO authenticated;
COMMENT ON FUNCTION public.create_project_change_notification IS 'Creates in-app (and email via webhook) notifications for project members when a project is updated, closed, or reopened. Excludes the user who made the change.';
