-- Seed Default Admin User (user-0)
-- This creates the initial admin user for the system
-- Credentials: cloud.architect@ezyy.cloud / Admin@123
-- Role: super_admin

-- Note: This script requires the admin user to be created in Supabase Auth first
-- via the Supabase Dashboard or Admin API. This script only creates the public.users record.
-- 
-- To create the auth user via Supabase Dashboard:
-- 1. Go to Authentication > Users
-- 2. Click "Add user" > "Create new user"
-- 3. Email: cloud.architect@ezyy.cloud
-- 4. Password: Admin@123
-- 5. Auto Confirm User: Yes
-- 6. Copy the user ID and use it below
--
-- OR use the Supabase Admin API to create the user programmatically

-- Function to seed admin user (idempotent)
-- This assumes the auth user already exists
DO $$
DECLARE
  admin_user_id UUID;
  super_admin_role_id UUID;
BEGIN
  -- Get the super_admin role ID
  SELECT id INTO super_admin_role_id
  FROM roles
  WHERE name = 'super_admin'
  LIMIT 1;

  -- Try to find existing admin user by email
  SELECT id INTO admin_user_id
  FROM auth.users
  WHERE email = 'cloud.architect@ezyy.cloud'
  LIMIT 1;

  -- If admin user exists in auth, create/update the public.users record
  IF admin_user_id IS NOT NULL THEN
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
      super_admin_role_id,
      true,
      admin_user_id
    )
    ON CONFLICT (id) DO UPDATE
    SET
      email = EXCLUDED.email,
      full_name = EXCLUDED.full_name,
      role_id = EXCLUDED.role_id,
      is_active = EXCLUDED.is_active,
      updated_at = NOW();
    
    RAISE NOTICE 'Admin user seeded successfully with ID: %', admin_user_id;
  ELSE
    RAISE WARNING 'Admin user not found in auth.users. Please create the user in Supabase Auth first (admin@furbank.com)';
  END IF;
END $$;

-- Alternative: If you want to create the auth user via SQL (requires elevated privileges)
-- This approach uses Supabase's auth schema functions
-- Note: This may not work in all Supabase setups and requires special permissions

-- Uncomment the following if you have the necessary permissions:
/*
DO $$
DECLARE
  admin_user_id UUID;
  super_admin_role_id UUID;
BEGIN
  -- Get the super_admin role ID
  SELECT id INTO super_admin_role_id
  FROM roles
  WHERE name = 'super_admin'
  LIMIT 1;

  -- Create auth user (this requires elevated privileges)
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    confirmation_token,
    recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    'admin@furbank.com',
    crypt('Admin@123', gen_salt('bf')),
    NOW(),
    NOW(),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    false,
    '',
    ''
  )
  ON CONFLICT (email) DO NOTHING
  RETURNING id INTO admin_user_id;

  -- Create public.users record
  IF admin_user_id IS NOT NULL THEN
    INSERT INTO public.users (
      id,
      email,
      full_name,
      role_id,
      is_active,
      created_by
    ) VALUES (
      admin_user_id,
      'admin@furbank.com',
      'System Administrator',
      super_admin_role_id,
      true,
      admin_user_id
    )
    ON CONFLICT (id) DO UPDATE
    SET
      email = EXCLUDED.email,
      full_name = EXCLUDED.full_name,
      role_id = EXCLUDED.role_id,
      is_active = EXCLUDED.is_active,
      updated_at = NOW();
  END IF;
END $$;
*/
