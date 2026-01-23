-- Migration 017: Allow admin to delete comments and users to update task status
-- 1. Adds DELETE policy for task_comments allowing admins to delete any comment
-- 2. Adds UPDATE policy for tasks allowing users to update status on assigned tasks

-- ============================================
-- Task Comments: Allow admins to delete comments
-- ============================================
CREATE POLICY "Admins can delete any comment" ON task_comments
  FOR DELETE 
  USING (
    public.user_has_role(ARRAY['super_admin', 'admin'])
  );

-- ============================================
-- Tasks: Allow users to update status on assigned tasks
-- ============================================
-- This policy allows users to update tasks they're assigned to
-- Note: This will work alongside the existing admin update policy
CREATE POLICY "Users can update status on assigned tasks" ON tasks
  FOR UPDATE 
  USING (
    assigned_to = auth.uid()
  )
  WITH CHECK (
    assigned_to = auth.uid()
  );
