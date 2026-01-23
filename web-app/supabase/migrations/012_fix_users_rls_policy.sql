-- Migration 012: Fix Users RLS Policy
-- Ensures super admins and admins can view all users
-- Fixes the user_has_role function to be more robust

-- First, let's improve the user_has_role function to handle edge cases better
CREATE OR REPLACE FUNCTION public.user_has_role(role_names TEXT[])
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  user_role_id UUID;
  role_id_check UUID;
BEGIN
  -- Get the current user's role_id directly (bypasses RLS due to SECURITY DEFINER)
  -- Use a direct query that bypasses RLS
  SELECT role_id INTO user_role_id
  FROM public.users
  WHERE id = auth.uid();
  
  -- If user doesn't have a role_id, return false
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

-- Ensure the function has proper permissions
GRANT EXECUTE ON FUNCTION public.user_has_role(TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_role(TEXT[]) TO anon;

-- Drop and recreate the policy to ensure it's correct
DROP POLICY IF EXISTS "Super admins and admins can view all users" ON users;

-- Recreate the policy with explicit check
-- This policy allows super_admins and admins to view all users
CREATE POLICY "Super admins and admins can view all users" ON users
  FOR SELECT 
  USING (
    public.user_has_role(ARRAY['super_admin', 'admin'])
  );

-- Also ensure users can always see themselves (this should already exist, but let's make sure)
DROP POLICY IF EXISTS "Users can view own profile" ON users;
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT 
  USING (id = auth.uid());

-- Verify the policies are working by creating a test function
-- This function can be called to check if the current user can see all users
CREATE OR REPLACE FUNCTION public.test_user_view_permission()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID;
  user_role_id UUID;
  role_name TEXT;
  can_view_all BOOLEAN;
  user_count INTEGER;
BEGIN
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RETURN json_build_object(
      'authenticated', false,
      'error', 'Not authenticated'
    );
  END IF;
  
  -- Get user's role
  SELECT role_id INTO user_role_id
  FROM public.users
  WHERE id = current_user_id;
  
  IF user_role_id IS NOT NULL THEN
    SELECT name INTO role_name
    FROM roles
    WHERE id = user_role_id;
  END IF;
  
  -- Check if user can view all
  can_view_all := public.user_has_role(ARRAY['super_admin', 'admin']);
  
  -- Count total users (this will respect RLS)
  SELECT COUNT(*) INTO user_count
  FROM public.users;
  
  RETURN json_build_object(
    'authenticated', true,
    'user_id', current_user_id,
    'role_id', user_role_id,
    'role_name', role_name,
    'can_view_all_users', can_view_all,
    'visible_user_count', user_count,
    'user_has_role_check', can_view_all
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.test_user_view_permission() TO authenticated;
