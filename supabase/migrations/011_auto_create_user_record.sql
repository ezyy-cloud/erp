-- Migration 011: Auto-create user records
-- Automatically creates a public.users record when a user is created in auth.users
-- This ensures users always have a corresponding record in public.users

-- Function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  default_role_id UUID;
BEGIN
  -- Get the default 'user' role ID
  SELECT id INTO default_role_id
  FROM roles
  WHERE name = 'user'
  LIMIT 1;

  -- Insert user record in public.users if it doesn't exist
  INSERT INTO public.users (
    id,
    email,
    full_name,
    role_id,
    is_active,
    created_by
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    default_role_id,
    true,
    NEW.id
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Trigger: Create user record when auth user is created
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Function to sync existing auth users who don't have public.users records
-- This can be run manually to fix existing users
CREATE OR REPLACE FUNCTION public.sync_missing_user_records()
RETURNS TABLE(
  user_id UUID,
  email TEXT,
  created BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  default_role_id UUID;
  auth_user RECORD;
BEGIN
  -- Get the default 'user' role ID
  SELECT id INTO default_role_id
  FROM roles
  WHERE name = 'user'
  LIMIT 1;

  -- Loop through auth users who don't have public.users records
  FOR auth_user IN
    SELECT au.id, au.email, au.raw_user_meta_data
    FROM auth.users au
    LEFT JOIN public.users pu ON au.id = pu.id
    WHERE pu.id IS NULL
  LOOP
    -- Insert the missing user record
    INSERT INTO public.users (
      id,
      email,
      full_name,
      role_id,
      is_active,
      created_by
    )
    VALUES (
      auth_user.id,
      auth_user.email,
      COALESCE(auth_user.raw_user_meta_data->>'full_name', auth_user.email),
      default_role_id,
      true,
      auth_user.id
    )
    ON CONFLICT (id) DO NOTHING;

    -- Return the result
    user_id := auth_user.id;
    email := auth_user.email;
    created := true;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- Function for users to create their own record if missing
-- This allows users to self-register their public.users record
CREATE OR REPLACE FUNCTION public.create_my_user_record()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  auth_user_id UUID;
  auth_user_email TEXT;
  auth_user_meta JSONB;
  default_role_id UUID;
  result JSON;
BEGIN
  -- Get current authenticated user
  auth_user_id := auth.uid();
  
  IF auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get user info from auth.users
  SELECT email, raw_user_meta_data INTO auth_user_email, auth_user_meta
  FROM auth.users
  WHERE id = auth_user_id;

  IF auth_user_email IS NULL THEN
    RAISE EXCEPTION 'User not found in auth.users';
  END IF;

  -- Check if user record already exists
  IF EXISTS (SELECT 1 FROM public.users WHERE id = auth_user_id) THEN
    RETURN json_build_object('success', true, 'message', 'User record already exists');
  END IF;

  -- Get the default 'user' role ID
  SELECT id INTO default_role_id
  FROM roles
  WHERE name = 'user'
  LIMIT 1;

  -- Create the user record
  INSERT INTO public.users (
    id,
    email,
    full_name,
    role_id,
    is_active,
    created_by
  )
  VALUES (
    auth_user_id,
    auth_user_email,
    COALESCE(auth_user_meta->>'full_name', auth_user_email),
    default_role_id,
    true,
    auth_user_id
  );

  RETURN json_build_object('success', true, 'message', 'User record created successfully');
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.sync_missing_user_records() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_my_user_record() TO authenticated;

-- Run the sync function to fix any existing users
-- This will create public.users records for any auth.users that don't have them
SELECT * FROM public.sync_missing_user_records();
