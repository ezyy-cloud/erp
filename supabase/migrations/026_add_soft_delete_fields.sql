-- Migration 026: Add Soft Delete Fields
-- Adds soft delete capability to tasks and users tables
-- Preserves data for audit purposes while hiding from normal views

-- Add soft delete fields to tasks table
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add soft delete fields to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add indexes for filtering soft-deleted records
CREATE INDEX IF NOT EXISTS idx_tasks_deleted_at ON tasks(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN tasks.deleted_at IS 'Timestamp when task was soft-deleted. NULL means not deleted.';
COMMENT ON COLUMN tasks.deleted_by IS 'User who soft-deleted the task. Only Super Admin can delete.';
COMMENT ON COLUMN users.deleted_at IS 'Timestamp when user was soft-deleted. NULL means not deleted.';
COMMENT ON COLUMN users.deleted_by IS 'User who soft-deleted the user. Only Super Admin can delete.';

-- Note: RLS policies will be updated in a later migration to filter soft-deleted records
-- This migration only adds the schema fields
