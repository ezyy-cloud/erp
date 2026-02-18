-- Fix RLS Policy Infinite Recursion
-- The users and project_members policies were causing infinite recursion
-- This migration creates a security definer function to check roles without triggering RLS

-- Create a security definer function to check user role
-- This function bypasses RLS, so it won't cause recursion
CREATE OR REPLACE FUNCTION public.user_has_role(role_names TEXT[])
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role_id UUID;
  role_id_check UUID;
BEGIN
  -- Get the current user's role_id directly (bypasses RLS)
  SELECT role_id INTO user_role_id
  FROM public.users
  WHERE id = auth.uid();
  
  IF user_role_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Check if the role_id matches any of the provided role names
  SELECT id INTO role_id_check
  FROM roles
  WHERE id = user_role_id
  AND name = ANY(role_names)
  LIMIT 1;
  
  RETURN role_id_check IS NOT NULL;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.user_has_role(TEXT[]) TO authenticated;

-- Drop ALL users policies to recreate them properly
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Senior consultants can view all users" ON users;
DROP POLICY IF EXISTS "Admins can view all users" ON users;
DROP POLICY IF EXISTS "Users can view project members" ON users;
DROP POLICY IF EXISTS "Super admins and admins can view all users" ON users;

-- Drop project_members policies
DROP POLICY IF EXISTS "Users can view members of accessible projects" ON project_members;
DROP POLICY IF EXISTS "Admins and consultants can manage project members" ON project_members;

-- Recreate users policies without circular dependency
-- Policy 1: Users can always see themselves
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (id = auth.uid());

-- Policy 2: Super admins and admins can see all users
-- Uses the security definer function to avoid recursion
CREATE POLICY "Super admins and admins can view all users" ON users
  FOR SELECT USING (public.user_has_role(ARRAY['super_admin', 'admin']));

-- Recreate project_members policies without circular dependency
-- Policy 1: Users can view members of accessible projects
CREATE POLICY "Users can view members of accessible projects" ON project_members
  FOR SELECT USING (
    -- Super admins and admins can see all project members
    public.user_has_role(ARRAY['super_admin', 'admin'])
    -- OR the user is viewing their own membership record (they are the member)
    OR user_id = auth.uid()
  );

-- Policy 2: Admins and super admins can manage project members
CREATE POLICY "Admins and consultants can manage project members" ON project_members
  FOR ALL USING (public.user_has_role(ARRAY['super_admin', 'admin']));
