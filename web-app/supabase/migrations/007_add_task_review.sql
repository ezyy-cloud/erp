-- Migration 007: Add Task Review Fields
-- Adds review workflow fields to tasks table for ERP-ready approval workflows

-- Add review fields to tasks table
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS review_status VARCHAR(50) DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS review_requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_comments TEXT;

-- Add check constraint for review_status
ALTER TABLE tasks
  ADD CONSTRAINT tasks_review_status_check 
  CHECK (review_status IN ('none', 'waiting_for_review', 'reviewed_approved', 'changes_requested'));

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_tasks_review_status ON tasks(review_status);
CREATE INDEX IF NOT EXISTS idx_tasks_review_requested_by ON tasks(review_requested_by);

-- Add comment for documentation
COMMENT ON COLUMN tasks.review_status IS 'Review workflow status: none, waiting_for_review, reviewed_approved, changes_requested';
COMMENT ON COLUMN tasks.review_requested_by IS 'User who requested review';
COMMENT ON COLUMN tasks.reviewed_by IS 'User who reviewed/approved the task';
COMMENT ON COLUMN tasks.review_comments IS 'Comments from reviewer (approval or change request)';
