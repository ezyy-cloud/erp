-- Migration 013: Fix Projects RLS Policies
-- Updates project creation and update policies to use user_has_role function
-- This avoids RLS recursion issues when checking user roles

-- Drop existing policies
DROP POLICY IF EXISTS "Admins and consultants can create projects" ON projects;
DROP POLICY IF EXISTS "Admins and consultants can update projects" ON projects;
DROP POLICY IF EXISTS "Senior consultants can view all projects" ON projects;
DROP POLICY IF EXISTS "Admins can view all projects" ON projects;

-- Recreate view policies using user_has_role function
CREATE POLICY "Super admins and admins can view all projects" ON projects
  FOR SELECT 
  USING (
    public.user_has_role(ARRAY['super_admin', 'admin'])
  );

-- Keep the existing policy for users viewing their own projects
-- (This should already exist, but ensure it's there)
DROP POLICY IF EXISTS "Users can view projects they are members of" ON projects;
CREATE POLICY "Users can view projects they are members of" ON projects
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_id = projects.id
        AND user_id = auth.uid()
    )
  );

-- Recreate create policy using user_has_role function
CREATE POLICY "Admins and consultants can create projects" ON projects
  FOR INSERT 
  WITH CHECK (
    public.user_has_role(ARRAY['super_admin', 'admin'])
  );

-- Recreate update policy using user_has_role function
CREATE POLICY "Admins and consultants can update projects" ON projects
  FOR UPDATE 
  USING (
    public.user_has_role(ARRAY['super_admin', 'admin'])
  );

-- Also fix the project_members policies to use the function
DROP POLICY IF EXISTS "Admins and consultants can manage project members" ON project_members;
CREATE POLICY "Admins and consultants can manage project members" ON project_members
  FOR ALL 
  USING (
    public.user_has_role(ARRAY['super_admin', 'admin'])
  );

-- Fix tasks policies to use user_has_role function
DROP POLICY IF EXISTS "Senior consultants can view all tasks" ON tasks;
DROP POLICY IF EXISTS "Admins can view all tasks" ON tasks;
DROP POLICY IF EXISTS "Admins and consultants can create tasks" ON tasks;
DROP POLICY IF EXISTS "Admins and consultants can update tasks" ON tasks;

-- Recreate tasks view policies
CREATE POLICY "Super admins and admins can view all tasks" ON tasks
  FOR SELECT 
  USING (
    public.user_has_role(ARRAY['super_admin', 'admin'])
  );

-- Keep existing policies for users viewing their own tasks
-- (These should already exist and work fine)

-- Recreate tasks create policy
CREATE POLICY "Admins and consultants can create tasks" ON tasks
  FOR INSERT 
  WITH CHECK (
    public.user_has_role(ARRAY['super_admin', 'admin'])
  );

-- Recreate tasks update policy
CREATE POLICY "Admins and consultants can update tasks" ON tasks
  FOR UPDATE 
  USING (
    public.user_has_role(ARRAY['super_admin', 'admin'])
  );
