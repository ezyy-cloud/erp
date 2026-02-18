-- Fix Admin User Role
-- Run this if the admin user exists but doesn't have the correct role
-- This will update the existing admin user to have super_admin role

DO $$
DECLARE
  admin_user_id UUID;
  senior_consultant_role_id UUID;
BEGIN
  -- Get the super_admin role ID
  SELECT id INTO senior_consultant_role_id
  FROM roles
  WHERE name = 'super_admin'
  LIMIT 1;

  IF senior_consultant_role_id IS NULL THEN
    RAISE EXCEPTION 'Senior consultant role not found. Please run 001_initial_schema.sql first.';
  END IF;

  -- Find the admin user by email
  SELECT id INTO admin_user_id
  FROM auth.users
  WHERE email = 'cloud.architect@ezyy.cloud'
  LIMIT 1;

  IF admin_user_id IS NULL THEN
    RAISE WARNING 'Admin user (cloud.architect@ezyy.cloud) not found in auth.users. Please create the user first.';
  ELSE
    -- Insert or update the admin user in public.users
    INSERT INTO public.users (
      id,
      email,
      full_name,
      role_id,
      is_active,
      created_by
    ) VALUES (
      admin_user_id,
      'cloud.architect@ezyy.cloud',
      'System Administrator',
      senior_consultant_role_id,
      true,
      admin_user_id
    )
    ON CONFLICT (id) DO UPDATE
    SET
      email = EXCLUDED.email,
      full_name = COALESCE(EXCLUDED.full_name, public.users.full_name, 'System Administrator'),
      role_id = senior_consultant_role_id,
      is_active = true,
      updated_at = NOW();
    
    RAISE NOTICE 'Admin user role updated successfully. User ID: %', admin_user_id;
  END IF;
END $$;

-- Verify the update
SELECT 
  u.id,
  u.email,
  u.full_name,
  u.is_active,
  r.name as role_name,
  r.description as role_description
FROM public.users u
LEFT JOIN roles r ON u.role_id = r.id
WHERE u.email = 'cloud.architect@ezyy.cloud';
