-- Migration 008: Create Notifications Table
-- Centralized notification system for all ERP modules

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  related_entity_type VARCHAR(50), -- 'task', 'project', etc.
  related_entity_id UUID,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

-- Add check constraint for notification types
ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'task_assigned',
    'task_due_soon',
    'task_overdue',
    'review_requested',
    'review_completed',
    'comment_added',
    'document_uploaded'
  ));

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_entity ON notifications(related_entity_type, related_entity_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(recipient_user_id, is_read) WHERE is_read = false;

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only SELECT their own notifications
CREATE POLICY "Users can view own notifications" ON notifications
  FOR SELECT USING (recipient_user_id = auth.uid());

-- RLS Policy: Users can UPDATE their own notifications (mark as read)
CREATE POLICY "Users can update own notifications" ON notifications
  FOR UPDATE USING (recipient_user_id = auth.uid());

-- RLS Policy: System can INSERT notifications via security definer functions
-- (No INSERT policy needed - security definer functions bypass RLS)

-- Add comments for documentation
COMMENT ON TABLE notifications IS 'Centralized notification system for all ERP modules';
COMMENT ON COLUMN notifications.type IS 'Notification type: task_assigned, task_due_soon, task_overdue, review_requested, review_completed, comment_added, document_uploaded';
COMMENT ON COLUMN notifications.related_entity_type IS 'Type of related entity: task, project, etc.';
COMMENT ON COLUMN notifications.related_entity_id IS 'ID of the related entity';
