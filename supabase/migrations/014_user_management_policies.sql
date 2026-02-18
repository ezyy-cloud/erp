-- Migration 014: User Management Policies
-- Allows admins and super_admins to update user records

-- Drop existing update policies if they exist
DROP POLICY IF EXISTS "Admins can update users" ON users;
DROP POLICY IF EXISTS "Super admins can update users" ON users;

-- Create policy for admins and super_admins to update users
CREATE POLICY "Admins and super admins can update users" ON users
  FOR UPDATE
  USING (
    public.user_has_role(ARRAY['super_admin', 'admin'])
  )
  WITH CHECK (
    public.user_has_role(ARRAY['super_admin', 'admin'])
  );

-- Note: Password reset in auth.users requires Supabase Admin API (service role key)
-- The frontend cannot directly update passwords in auth.users
-- This should be done via a serverless function in production
-- 
-- For now, we provide a function that generates a password and returns it
-- The admin must manually set it via Supabase Dashboard or implement a serverless function

-- Function to generate a secure password (for use in password reset)
-- Note: This doesn't actually update the password in auth.users
-- That requires Admin API access via serverless function
CREATE OR REPLACE FUNCTION public.generate_user_password()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  charset TEXT := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  password TEXT := '';
  uppercase_chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  lowercase_chars TEXT := 'abcdefghijklmnopqrstuvwxyz';
  number_chars TEXT := '0123456789';
  special_chars TEXT := '!@#$%^&*';
  i INTEGER;
  random_pos INTEGER;
BEGIN
  -- Ensure at least one of each required character type
  random_pos := floor(random() * length(uppercase_chars) + 1)::integer;
  password := password || substring(uppercase_chars FROM random_pos FOR 1);
  
  random_pos := floor(random() * length(lowercase_chars) + 1)::integer;
  password := password || substring(lowercase_chars FROM random_pos FOR 1);
  
  random_pos := floor(random() * length(number_chars) + 1)::integer;
  password := password || substring(number_chars FROM random_pos FOR 1);
  
  random_pos := floor(random() * length(special_chars) + 1)::integer;
  password := password || substring(special_chars FROM random_pos FOR 1);
  
  -- Fill the rest randomly (up to 12 characters total)
  FOR i IN length(password) + 1..12 LOOP
    random_pos := floor(random() * length(charset) + 1)::integer;
    password := password || substring(charset FROM random_pos FOR 1);
  END LOOP;
  
  RETURN password;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_user_password() TO authenticated;
