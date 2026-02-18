-- Migration 053: Enable Notifications Realtime and Email
-- 1. Add notifications table to supabase_realtime publication for in-app live updates
-- 2. Create trigger to invoke send-notification-email Edge Function on INSERT for emails

-- ============================================
-- Part A: Enable Realtime for notifications
-- ============================================
-- Required for postgres_changes subscriptions to receive INSERT events in the client
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- ============================================
-- Part B: Email webhook via pg_net trigger
-- ============================================
-- Invokes send-notification-email Edge Function on every notifications INSERT.
-- Uses project URL from config (gqyigihstsxligqmsrwc); update if using different project.
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.notify_send_email_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://gqyigihstsxligqmsrwc.supabase.co/functions/v1/send-notification-email',
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'notifications',
      'schema', 'public',
      'record', to_jsonb(NEW),
      'old_record', NULL
    ),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_send_email_webhook ON notifications;
CREATE TRIGGER notifications_send_email_webhook
  AFTER INSERT ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_send_email_on_insert();

COMMENT ON FUNCTION public.notify_send_email_on_insert IS 'Calls send-notification-email Edge Function on each notifications INSERT. Uses pg_net for async HTTP POST.';
