-- Migration 045: Fix Email Unique Constraint for Soft Delete
-- Allows same email for deleted users while maintaining uniqueness for active users
-- This enables restoring deleted users without constraint violations

-- Drop the existing unique constraint on email
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;

-- Create a partial unique index that only enforces uniqueness for non-deleted users
-- This allows multiple deleted users with the same email, but only one active user per email
CREATE UNIQUE INDEX IF NOT EXISTS users_email_active_unique 
ON users(email) 
WHERE deleted_at IS NULL;

-- Add comment explaining the constraint
COMMENT ON INDEX users_email_active_unique IS 
'Ensures email uniqueness only for active (non-deleted) users. Deleted users can have duplicate emails, allowing restoration without constraint violations.';
