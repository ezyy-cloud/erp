-- Storage Bucket Setup for Task Files
-- Run this in Supabase SQL Editor after creating the bucket manually

-- Create the storage bucket (if not already created via UI)
-- Note: Buckets are typically created via the Supabase Dashboard UI
-- This is for reference only

-- Storage policies for task-files bucket
-- These policies ensure only authenticated users can upload/download files
-- and only for tasks they have access to

-- Allow authenticated users to upload files
CREATE POLICY "Authenticated users can upload task files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'task-files');

-- Allow users to view files for tasks they can access
-- Note: This is a simplified policy. In production, you may want to
-- check task access via a function that queries the tasks table
CREATE POLICY "Users can view task files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'task-files');

-- Allow users to delete their own uploaded files
CREATE POLICY "Users can delete own task files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'task-files' AND auth.uid()::text = (storage.foldername(name))[1]);
