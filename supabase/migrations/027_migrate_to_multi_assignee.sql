-- Migration 027: Migrate to Multi-Assignee Model
-- Migrates existing single assignee (assigned_to) to task_assignees table
-- Keeps assigned_to column for backward compatibility (deprecated)

-- Migrate existing assigned_to values to task_assignees table
INSERT INTO task_assignees (task_id, user_id, assigned_at, assigned_by)
SELECT 
  id AS task_id,
  assigned_to AS user_id,
  created_at AS assigned_at, -- Use task creation time as assignment time
  created_by AS assigned_by -- Use task creator as assigner
FROM tasks
WHERE assigned_to IS NOT NULL
  AND NOT EXISTS (
    -- Avoid duplicates if migration runs multiple times
    SELECT 1 FROM task_assignees ta
    WHERE ta.task_id = tasks.id
    AND ta.user_id = tasks.assigned_to
  );

-- Add comment to assigned_to column marking it as deprecated
COMMENT ON COLUMN tasks.assigned_to IS 'DEPRECATED: Use task_assignees table instead. This column is kept for backward compatibility but should not be used in new code.';

-- Note: The assigned_to column remains in the schema for backward compatibility
-- New code should use task_assignees table exclusively
-- The column will be removed in a future migration after all code is updated
