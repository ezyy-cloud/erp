-- Migration 023: Create task-files storage bucket
-- Creates the storage bucket for task file uploads if it doesn't exist

-- IMPORTANT: Storage buckets must be created via Supabase Dashboard UI
-- Go to Storage > New Bucket and create a bucket named 'task-files'
-- Set it to Private (not public)
-- Then run the policies below

-- Note: The bucket creation SQL below may not work without superuser privileges
-- If the INSERT fails, create the bucket manually via Supabase Dashboard

-- Attempt to create the bucket (may fail without proper permissions)
DO $$
BEGIN
  -- Check if bucket exists
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'task-files') THEN
    -- Try to create the bucket
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'task-files',
      'task-files',
      false, -- Private bucket
      52428800, -- 50MB file size limit
      ARRAY[
        'application/pdf',
        'image/jpeg',
        'image/jpg',
        'image/png',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ]
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- If bucket creation fails, log a warning but continue
    RAISE NOTICE 'Could not create bucket via SQL. Please create "task-files" bucket manually via Supabase Dashboard: Storage > New Bucket';
END $$;

-- Storage policies for task-files bucket
-- These policies ensure only authenticated users can upload/download files
-- and only for tasks they have access to

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Authenticated users can upload task files" ON storage.objects;
DROP POLICY IF EXISTS "Users can view task files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own task files" ON storage.objects;

-- Allow authenticated users to upload files to task-files bucket
-- Application-level validation enforces file types
CREATE POLICY "Authenticated users can upload task files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'task-files');

-- Allow users to view files for tasks they can access
CREATE POLICY "Users can view task files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'task-files'
  AND EXISTS (
    SELECT 1 FROM tasks t
    JOIN task_files tf ON (
      -- Match file path (handle both old format with bucket prefix and new format without)
      tf.file_path = storage.objects.name 
      OR tf.file_path = 'task-files/' || storage.objects.name
      OR 'task-files/' || tf.file_path = storage.objects.name
    )
    WHERE tf.task_id = t.id
    AND (
      t.assigned_to = auth.uid()
      OR public.user_has_role(ARRAY['super_admin', 'admin'])
      OR (
        t.project_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM project_members pm
          WHERE pm.project_id = t.project_id
          AND pm.user_id = auth.uid()
        )
      )
    )
  )
);

-- Allow users to delete their own uploaded files (optional - for cleanup)
-- Super Admin can also delete any file
CREATE POLICY "Users can delete own task files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'task-files'
  AND (
    EXISTS (
      SELECT 1 FROM task_files tf
      WHERE (
        tf.file_path = storage.objects.name 
        OR tf.file_path = 'task-files/' || storage.objects.name
        OR 'task-files/' || tf.file_path = storage.objects.name
      )
      AND tf.user_id = auth.uid()
    )
    OR public.user_has_role(ARRAY['super_admin'])
  )
);
