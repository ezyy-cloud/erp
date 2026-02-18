-- Migration 049: Add Notifications for Bulletin Board and To-Do Completion
-- Extends notification system to support bulletin posts and todo completions

-- ============================================
-- 1. Update Notification Type Constraint
-- ============================================

-- Drop existing constraint
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Recreate with new types
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
    'bulletin_posted'
  ));

-- Update comment
COMMENT ON COLUMN notifications.type IS 'Notification type: task_assigned, task_due_soon, task_overdue, review_requested, review_completed, comment_added, document_uploaded, todo_completed, bulletin_posted';

-- ============================================
-- 2. Function: Create todo completion notification
-- ============================================
-- Notifies all assigned users and all admins when a todo is completed
CREATE OR REPLACE FUNCTION create_todo_completion_notification(
  p_todo_id UUID,
  p_completed_by UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_todo_text TEXT;
  v_assigned_user_ids UUID[];
  v_assigned_user_id UUID;
  v_admin_ids UUID[];
  v_admin_id UUID;
  v_completed_user_name TEXT;
BEGIN
  -- Get todo text
  SELECT text INTO v_todo_text
  FROM todo_items
  WHERE id = p_todo_id
    AND deleted_at IS NULL;

  IF v_todo_text IS NULL THEN
    RETURN NULL;
  END IF;

  -- Get completed user name
  SELECT COALESCE(full_name, email) INTO v_completed_user_name
  FROM users
  WHERE id = p_completed_by;

  -- Get all assigned user IDs (excluding the completer)
  SELECT ARRAY_AGG(user_id) INTO v_assigned_user_ids
  FROM todo_assignees
  WHERE todo_id = p_todo_id
    AND user_id != p_completed_by;

  -- Notify all assigned users (excluding the one who completed)
  IF v_assigned_user_ids IS NOT NULL THEN
    FOREACH v_assigned_user_id IN ARRAY v_assigned_user_ids
    LOOP
      INSERT INTO notifications (
        recipient_user_id,
        type,
        title,
        message,
        related_entity_type,
        related_entity_id
      ) VALUES (
        v_assigned_user_id,
        'todo_completed',
        'To-Do Completed',
        COALESCE(v_completed_user_name, 'Someone') || ' completed to-do: ' || v_todo_text,
        'todo',
        p_todo_id
      );
    END LOOP;
  END IF;

  -- Get all admin and super_admin user IDs
  SELECT ARRAY_AGG(u.id) INTO v_admin_ids
  FROM users u
  JOIN roles r ON u.role_id = r.id
  WHERE r.name IN ('admin', 'super_admin')
    AND u.deleted_at IS NULL
    AND u.is_active = true
    AND u.id != p_completed_by; -- Don't notify the completer if they're an admin

  -- Create notifications for all admins
  IF v_admin_ids IS NOT NULL THEN
    FOREACH v_admin_id IN ARRAY v_admin_ids
    LOOP
      INSERT INTO notifications (
        recipient_user_id,
        type,
        title,
        message,
        related_entity_type,
        related_entity_id
      ) VALUES (
        v_admin_id,
        'todo_completed',
        'To-Do Completed',
        COALESCE(v_completed_user_name, 'Someone') || ' completed to-do: ' || v_todo_text,
        'todo',
        p_todo_id
      );
    END LOOP;
  END IF;

  RETURN NULL; -- Multiple notifications created
END;
$$;

-- ============================================
-- 3. Function: Create bulletin posted notification
-- ============================================
-- Notifies all active users when a new bulletin is posted
CREATE OR REPLACE FUNCTION create_bulletin_posted_notification(
  p_bulletin_id UUID,
  p_creator_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bulletin_title TEXT;
  v_creator_name TEXT;
  v_user_ids UUID[];
  v_user_id UUID;
BEGIN
  -- Get bulletin title
  SELECT title INTO v_bulletin_title
  FROM bulletins
  WHERE id = p_bulletin_id
    AND deleted_at IS NULL;

  IF v_bulletin_title IS NULL THEN
    RETURN NULL;
  END IF;

  -- Get creator name
  SELECT COALESCE(full_name, email) INTO v_creator_name
  FROM users
  WHERE id = p_creator_id;

  -- Get all active users (excluding creator)
  SELECT ARRAY_AGG(id) INTO v_user_ids
  FROM users
  WHERE deleted_at IS NULL
    AND is_active = true
    AND id != p_creator_id;

  -- Create notifications for all users
  IF v_user_ids IS NOT NULL THEN
    FOREACH v_user_id IN ARRAY v_user_ids
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
        'bulletin_posted',
        'New Bulletin Posted',
        COALESCE(v_creator_name, 'Admin') || ' posted a new notice: ' || v_bulletin_title,
        'bulletin',
        p_bulletin_id
      );
    END LOOP;
  END IF;

  RETURN NULL; -- Multiple notifications created
END;
$$;

-- ============================================
-- 4. Grant Execute Permissions
-- ============================================
GRANT EXECUTE ON FUNCTION create_todo_completion_notification(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION create_bulletin_posted_notification(UUID, UUID) TO authenticated;

-- ============================================
-- 5. Trigger: Notify on todo completion
-- ============================================
CREATE OR REPLACE FUNCTION notify_todo_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only notify on INSERT (when todo is marked as completed)
  -- We don't notify on DELETE (when uncompleting)
  IF TG_OP = 'INSERT' THEN
    PERFORM create_todo_completion_notification(NEW.todo_id, NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER todo_completion_notification
  AFTER INSERT ON todo_completions
  FOR EACH ROW
  EXECUTE FUNCTION notify_todo_completion();

-- ============================================
-- 6. Trigger: Notify on bulletin creation
-- ============================================
CREATE OR REPLACE FUNCTION notify_bulletin_posted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only notify on INSERT (when bulletin is created)
  IF TG_OP = 'INSERT' THEN
    PERFORM create_bulletin_posted_notification(NEW.id, NEW.creator_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER bulletin_posted_notification
  AFTER INSERT ON bulletins
  FOR EACH ROW
  WHEN (NEW.deleted_at IS NULL)
  EXECUTE FUNCTION notify_bulletin_posted();

-- ============================================
-- 7. Add Comments
-- ============================================
COMMENT ON FUNCTION create_todo_completion_notification IS 'Notifies the assigned user and all admins when a todo item is completed';
COMMENT ON FUNCTION create_bulletin_posted_notification IS 'Notifies all active users when a new bulletin notice is posted';
