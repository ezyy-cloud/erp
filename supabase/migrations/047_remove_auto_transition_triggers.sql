-- Migration 047: Remove Auto-Transition Triggers
-- Removes automatic status transitions when users comment, add notes, or upload files
-- Status changes must now be explicit user actions

-- ============================================
-- 1. Drop Auto-Transition Triggers
-- ============================================

-- Drop triggers that automatically transition tasks from ToDo to Work-In-Progress
DROP TRIGGER IF EXISTS auto_transition_on_comment ON task_comments;
DROP TRIGGER IF EXISTS auto_transition_on_note ON task_notes;
DROP TRIGGER IF EXISTS auto_transition_on_file ON task_files;

-- Note: We keep the transition_to_work_in_progress function for explicit calls
-- The function itself is not dropped, only the automatic triggers are removed

-- ============================================
-- 2. Comments
-- ============================================

COMMENT ON FUNCTION public.transition_to_work_in_progress(UUID, UUID) IS 
  'Explicit function to transition task from ToDo to Work-In-Progress. Must be called explicitly - no automatic triggers.';

-- ============================================
-- 3. Migration Notes
-- ============================================

-- This migration removes implicit status changes. After this migration:
-- 1. Commenting on a task will NOT automatically change status
-- 2. Adding notes will NOT automatically change status  
-- 3. Uploading files will NOT automatically change status
-- 4. Status changes must be explicit user actions via UI buttons/modals
-- 5. The transition_to_work_in_progress function remains available for explicit calls
