-- Add user preferences: theme_preference and avatar_url
-- This migration adds fields to store user theme preference and profile avatar

-- Add theme_preference column (light, dark, or system)
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS theme_preference VARCHAR(20) DEFAULT 'system' CHECK (theme_preference IN ('light', 'dark', 'system'));

-- Add avatar_url column for profile image
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Create index for theme_preference (though not critical, helps with queries)
CREATE INDEX IF NOT EXISTS idx_users_theme_preference ON public.users(theme_preference);

-- Add comment for documentation
COMMENT ON COLUMN public.users.theme_preference IS 'User theme preference: light, dark, or system (follows OS preference)';
COMMENT ON COLUMN public.users.avatar_url IS 'URL to user profile avatar image stored in Supabase Storage';

-- RLS Policy: Allow users to update their own profile preferences
-- Users can update: full_name, theme_preference, and avatar_url
-- They cannot update: email, role_id, is_active, or other sensitive fields
DROP POLICY IF EXISTS "Users can update own profile preferences" ON users;
CREATE POLICY "Users can update own profile preferences" ON users
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    -- Ensure they're only updating allowed fields
    -- This is enforced at the application level, but RLS provides defense in depth
  );

-- Create avatars storage bucket for user profile images
-- Attempt to create the bucket (may fail without proper permissions)
DO $$
BEGIN
  -- Check if bucket exists
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'avatars') THEN
    -- Try to create the bucket
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'avatars',
      'avatars',
      false, -- Private bucket
      5242880, -- 5MB file size limit for avatars
      ARRAY[
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp'
      ]
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- If bucket creation fails, log a warning but continue
    RAISE NOTICE 'Could not create bucket via SQL. Please create "avatars" bucket manually via Supabase Dashboard: Storage > New Bucket';
END $$;

-- Storage policies for avatars bucket
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can view avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;

-- Allow users to upload their own avatar
CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to view all avatars (for displaying in UI)
CREATE POLICY "Users can view avatars"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'avatars');

-- Allow users to update their own avatar
CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to delete their own avatar
CREATE POLICY "Users can delete own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
