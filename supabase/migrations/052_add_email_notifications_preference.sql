-- Migration 052: Add email notifications user preference
-- When false, send-notification-email Edge Function skips sending email for that user.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS email_notifications_enabled BOOLEAN DEFAULT true;

COMMENT ON COLUMN public.users.email_notifications_enabled IS 'When true, user receives notification emails via Resend. When false, in-app notifications only.';

-- Policy "Users can update own profile preferences" already allows UPDATE on own row; no change needed.
-- Users may update this column along with theme_preference and avatar_url.
