-- Migration 009: Notification Trigger Functions
-- Security definer functions and triggers for automatic notification creation

-- Function: Create task assignment notification
CREATE OR REPLACE FUNCTION create_task_assignment_notification(
  p_task_id UUID,
  p_assigned_to UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task_title VARCHAR(255);
  v_notification_id UUID;
BEGIN
  -- Get task title
  SELECT title INTO v_task_title
  FROM tasks
  WHERE id = p_task_id;
  
  -- Don't notify if assigned to null
  IF p_assigned_to IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Create notification
  INSERT INTO notifications (
    recipient_user_id,
    type,
    title,
    message,
    related_entity_type,
    related_entity_id
  ) VALUES (
    p_assigned_to,
    'task_assigned',
    'Task Assigned',
    'You have been assigned to task: ' || COALESCE(v_task_title, 'Untitled Task'),
    'task',
    p_task_id
  ) RETURNING id INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$;

-- Function: Create task due soon notification
CREATE OR REPLACE FUNCTION create_task_due_soon_notification(
  p_task_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task_title VARCHAR(255);
  v_assigned_to UUID;
  v_notification_id UUID;
BEGIN
  -- Get task details
  SELECT title, assigned_to INTO v_task_title, v_assigned_to
  FROM tasks
  WHERE id = p_task_id;
  
  -- Don't notify if no assignee
  IF v_assigned_to IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Create notification
  INSERT INTO notifications (
    recipient_user_id,
    type,
    title,
    message,
    related_entity_type,
    related_entity_id
  ) VALUES (
    v_assigned_to,
    'task_due_soon',
    'Task Due Soon',
    'Task "' || COALESCE(v_task_title, 'Untitled Task') || '" is due soon',
    'task',
    p_task_id
  ) RETURNING id INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$;

-- Function: Create task overdue notification
CREATE OR REPLACE FUNCTION create_task_overdue_notification(
  p_task_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task_title VARCHAR(255);
  v_assigned_to UUID;
  v_notification_id UUID;
BEGIN
  -- Get task details
  SELECT title, assigned_to INTO v_task_title, v_assigned_to
  FROM tasks
  WHERE id = p_task_id;
  
  -- Don't notify if no assignee
  IF v_assigned_to IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Create notification
  INSERT INTO notifications (
    recipient_user_id,
    type,
    title,
    message,
    related_entity_type,
    related_entity_id
  ) VALUES (
    v_assigned_to,
    'task_overdue',
    'Task Overdue',
    'Task "' || COALESCE(v_task_title, 'Untitled Task') || '" is overdue',
    'task',
    p_task_id
  ) RETURNING id INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$;

-- Function: Create review requested notification
CREATE OR REPLACE FUNCTION create_review_requested_notification(
  p_task_id UUID,
  p_requested_by UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task_title VARCHAR(255);
  v_project_id UUID;
  v_reviewer_ids UUID[];
  v_notification_id UUID;
  v_reviewer_id UUID;
BEGIN
  -- Get task details
  SELECT title, project_id INTO v_task_title, v_project_id
  FROM tasks
  WHERE id = p_task_id;
  
  -- Find potential reviewers (admins and super_admins)
  SELECT ARRAY_AGG(u.id) INTO v_reviewer_ids
  FROM users u
  JOIN roles r ON u.role_id = r.id
  WHERE r.name IN ('admin', 'super_admin')
    AND u.id != p_requested_by; -- Don't notify the requester
  
  -- Create notifications for each reviewer
  IF v_reviewer_ids IS NOT NULL THEN
    FOREACH v_reviewer_id IN ARRAY v_reviewer_ids
    LOOP
      INSERT INTO notifications (
        recipient_user_id,
        type,
        title,
        message,
        related_entity_type,
        related_entity_id
      ) VALUES (
        v_reviewer_id,
        'review_requested',
        'Review Requested',
        'Task "' || COALESCE(v_task_title, 'Untitled Task') || '" is waiting for review',
        'task',
        p_task_id
      );
    END LOOP;
  END IF;
  
  RETURN NULL; -- Multiple notifications created
END;
$$;

-- Function: Create review completed notification
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
  v_requested_by UUID;
  v_notification_id UUID;
  v_message TEXT;
BEGIN
  -- Get task details
  SELECT title, review_requested_by INTO v_task_title, v_requested_by
  FROM tasks
  WHERE id = p_task_id;
  
  -- Don't notify if no one requested review
  IF v_requested_by IS NULL OR v_requested_by = p_reviewed_by THEN
    RETURN NULL;
  END IF;
  
  -- Build message based on status
  IF p_status = 'reviewed_approved' THEN
    v_message := 'Task "' || COALESCE(v_task_title, 'Untitled Task') || '" has been approved';
  ELSIF p_status = 'changes_requested' THEN
    v_message := 'Changes have been requested for task "' || COALESCE(v_task_title, 'Untitled Task') || '"';
  ELSE
    RETURN NULL;
  END IF;
  
  -- Create notification for the requester
  INSERT INTO notifications (
    recipient_user_id,
    type,
    title,
    message,
    related_entity_type,
    related_entity_id
  ) VALUES (
    v_requested_by,
    'review_completed',
    'Review Completed',
    v_message,
    'task',
    p_task_id
  ) RETURNING id INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$;

-- Function: Create comment added notification
CREATE OR REPLACE FUNCTION create_comment_added_notification(
  p_task_id UUID,
  p_commenter_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task_title VARCHAR(255);
  v_assigned_to UUID;
  v_project_id UUID;
  v_notification_ids UUID[];
  v_user_id UUID;
  v_notification_id UUID;
BEGIN
  -- Get task details
  SELECT title, assigned_to, project_id INTO v_task_title, v_assigned_to, v_project_id
  FROM tasks
  WHERE id = p_task_id;
  
  -- Collect users to notify (assignee and project members, excluding commenter)
  WITH users_to_notify AS (
    SELECT DISTINCT u.id
    FROM users u
    WHERE (
      u.id = v_assigned_to
      OR EXISTS (
        SELECT 1 FROM project_members pm
        WHERE pm.project_id = v_project_id
        AND pm.user_id = u.id
      )
    )
    AND u.id != p_commenter_id
  )
  SELECT ARRAY_AGG(id) INTO v_notification_ids
  FROM users_to_notify;
  
  -- Create notifications
  IF v_notification_ids IS NOT NULL THEN
    FOREACH v_user_id IN ARRAY v_notification_ids
    LOOP
      INSERT INTO notifications (
        recipient_user_id,
        type,
        title,
        message,
        related_entity_type,
        related_entity_id
      ) VALUES (
        v_user_id,
        'comment_added',
        'New Comment',
        'A new comment was added to task "' || COALESCE(v_task_title, 'Untitled Task') || '"',
        'task',
        p_task_id
      );
    END LOOP;
  END IF;
  
  RETURN NULL; -- Multiple notifications created
END;
$$;

-- Function: Create document uploaded notification
CREATE OR REPLACE FUNCTION create_document_uploaded_notification(
  p_task_id UUID,
  p_uploader_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task_title VARCHAR(255);
  v_assigned_to UUID;
  v_project_id UUID;
  v_notification_ids UUID[];
  v_user_id UUID;
BEGIN
  -- Get task details
  SELECT title, assigned_to, project_id INTO v_task_title, v_assigned_to, v_project_id
  FROM tasks
  WHERE id = p_task_id;
  
  -- Collect users to notify (assignee and project members, excluding uploader)
  WITH users_to_notify AS (
    SELECT DISTINCT u.id
    FROM users u
    WHERE (
      u.id = v_assigned_to
      OR EXISTS (
        SELECT 1 FROM project_members pm
        WHERE pm.project_id = v_project_id
        AND pm.user_id = u.id
      )
    )
    AND u.id != p_uploader_id
  )
  SELECT ARRAY_AGG(id) INTO v_notification_ids
  FROM users_to_notify;
  
  -- Create notifications
  IF v_notification_ids IS NOT NULL THEN
    FOREACH v_user_id IN ARRAY v_notification_ids
    LOOP
      INSERT INTO notifications (
        recipient_user_id,
        type,
        title,
        message,
        related_entity_type,
        related_entity_id
      ) VALUES (
        v_user_id,
        'document_uploaded',
        'Document Uploaded',
        'A new document was uploaded to task "' || COALESCE(v_task_title, 'Untitled Task') || '"',
        'task',
        p_task_id
      );
    END LOOP;
  END IF;
  
  RETURN NULL; -- Multiple notifications created
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION create_task_assignment_notification(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION create_task_due_soon_notification(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION create_task_overdue_notification(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION create_review_requested_notification(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION create_review_completed_notification(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_comment_added_notification(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION create_document_uploaded_notification(UUID, UUID) TO authenticated;

-- Trigger: Notify on task assignment
CREATE OR REPLACE FUNCTION notify_task_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only notify if assigned_to changed and is not null
  IF NEW.assigned_to IS NOT NULL AND (OLD.assigned_to IS NULL OR NEW.assigned_to != OLD.assigned_to) THEN
    PERFORM create_task_assignment_notification(NEW.id, NEW.assigned_to);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER task_assignment_notification
  AFTER UPDATE OF assigned_to ON tasks
  FOR EACH ROW
  WHEN (NEW.assigned_to IS NOT NULL AND (OLD.assigned_to IS NULL OR NEW.assigned_to != OLD.assigned_to))
  EXECUTE FUNCTION notify_task_assignment();

-- Trigger: Notify on comment added
CREATE OR REPLACE FUNCTION notify_comment_added()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM create_comment_added_notification(NEW.task_id, NEW.user_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER comment_added_notification
  AFTER INSERT ON task_comments
  FOR EACH ROW
  EXECUTE FUNCTION notify_comment_added();

-- Trigger: Notify on document uploaded
CREATE OR REPLACE FUNCTION notify_document_uploaded()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM create_document_uploaded_notification(NEW.task_id, NEW.user_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER document_uploaded_notification
  AFTER INSERT ON task_files
  FOR EACH ROW
  EXECUTE FUNCTION notify_document_uploaded();

-- Note: Due soon and overdue notifications are handled at application level
-- They can be moved to pg_cron jobs later for better performance
