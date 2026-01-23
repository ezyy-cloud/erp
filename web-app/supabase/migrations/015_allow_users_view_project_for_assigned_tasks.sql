-- Migration 015: Allow users to view projects for tasks they're assigned to
-- This fixes the issue where users see "Unknown Project" when viewing tasks
-- assigned to them in projects they're not members of

-- Add policy to allow users to view projects for tasks they're assigned to
CREATE POLICY "Users can view projects for assigned tasks" ON projects
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM tasks
      WHERE tasks.project_id = projects.id
        AND tasks.assigned_to = auth.uid()
    )
  );
