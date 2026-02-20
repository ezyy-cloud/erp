-- Migration 056: Notify All Assignees on Task Activity (Comments, Notes, Files)
-- Fixes:
--   1. comment_added and document_uploaded notification functions only checked
--      legacy assigned_to and project_members; they now also include task_assignees.
--   2. task_notes had no notification at all — adds note_added type, function, and trigger.

-- ============================================
-- 1. Add note_added to notification type constraint
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
    'note_added',
    'todo_completed',
    'bulletin_posted',
    'project_updated',
    'project_closed',
    'project_reopened'
  ));

COMMENT ON COLUMN notifications.type IS 'Notification type: task_*, review_*, comment_added, document_uploaded, note_added, todo_completed, bulletin_posted, project_*';

-- ============================================
-- 2. Update comment notification to include task_assignees
-- ============================================

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
  v_user_ids UUID[];
  v_user_id UUID;
BEGIN
  SELECT title INTO v_task_title
  FROM tasks
  WHERE id = p_task_id;

  WITH users_to_notify AS (
    SELECT DISTINCT u.id
    FROM users u
    WHERE u.deleted_at IS NULL
      AND u.is_active = true
      AND u.id != p_commenter_id
      AND (
        EXISTS (
          SELECT 1 FROM task_assignees ta
          WHERE ta.task_id = p_task_id AND ta.user_id = u.id
        )
        OR u.id = (SELECT assigned_to FROM tasks WHERE id = p_task_id)
        OR EXISTS (
          SELECT 1 FROM project_members pm
          WHERE pm.project_id = (SELECT project_id FROM tasks WHERE id = p_task_id)
            AND pm.user_id = u.id
        )
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
        'comment_added',
        'New Comment',
        'A new comment was added to task "' || COALESCE(v_task_title, 'Untitled Task') || '"',
        'task',
        p_task_id
      );
    END LOOP;
  END IF;

  RETURN NULL;
END;
$$;

-- ============================================
-- 3. Update document notification to include task_assignees
-- ============================================

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
  v_user_ids UUID[];
  v_user_id UUID;
BEGIN
  SELECT title INTO v_task_title
  FROM tasks
  WHERE id = p_task_id;

  WITH users_to_notify AS (
    SELECT DISTINCT u.id
    FROM users u
    WHERE u.deleted_at IS NULL
      AND u.is_active = true
      AND u.id != p_uploader_id
      AND (
        EXISTS (
          SELECT 1 FROM task_assignees ta
          WHERE ta.task_id = p_task_id AND ta.user_id = u.id
        )
        OR u.id = (SELECT assigned_to FROM tasks WHERE id = p_task_id)
        OR EXISTS (
          SELECT 1 FROM project_members pm
          WHERE pm.project_id = (SELECT project_id FROM tasks WHERE id = p_task_id)
            AND pm.user_id = u.id
        )
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
        'document_uploaded',
        'Document Uploaded',
        'A new document was uploaded to task "' || COALESCE(v_task_title, 'Untitled Task') || '"',
        'task',
        p_task_id
      );
    END LOOP;
  END IF;

  RETURN NULL;
END;
$$;

-- ============================================
-- 4. Create note_added notification function
-- ============================================

CREATE OR REPLACE FUNCTION create_note_added_notification(
  p_task_id UUID,
  p_author_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task_title VARCHAR(255);
  v_user_ids UUID[];
  v_user_id UUID;
BEGIN
  SELECT title INTO v_task_title
  FROM tasks
  WHERE id = p_task_id;

  WITH users_to_notify AS (
    SELECT DISTINCT u.id
    FROM users u
    WHERE u.deleted_at IS NULL
      AND u.is_active = true
      AND u.id != p_author_id
      AND (
        EXISTS (
          SELECT 1 FROM task_assignees ta
          WHERE ta.task_id = p_task_id AND ta.user_id = u.id
        )
        OR u.id = (SELECT assigned_to FROM tasks WHERE id = p_task_id)
        OR EXISTS (
          SELECT 1 FROM project_members pm
          WHERE pm.project_id = (SELECT project_id FROM tasks WHERE id = p_task_id)
            AND pm.user_id = u.id
        )
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
        'note_added',
        'New Note',
        'A new note was added to task "' || COALESCE(v_task_title, 'Untitled Task') || '"',
        'task',
        p_task_id
      );
    END LOOP;
  END IF;

  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION create_note_added_notification(UUID, UUID) TO authenticated;

-- ============================================
-- 5. Create trigger on task_notes INSERT
-- ============================================

CREATE OR REPLACE FUNCTION notify_note_added()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM create_note_added_notification(NEW.task_id, NEW.user_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS note_added_notification ON task_notes;
CREATE TRIGGER note_added_notification
  AFTER INSERT ON task_notes
  FOR EACH ROW
  EXECUTE FUNCTION notify_note_added();
