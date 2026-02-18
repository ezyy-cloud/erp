// Supabase Edge Function: Send Notification Email
// Invoked by Database Webhook on notifications INSERT. Sends one email per notification via Resend.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

type NotificationRecord = {
  id?: string;
  recipient_user_id: string;
  type: string;
  title: string;
  message: string;
  related_entity_type?: string | null;
  related_entity_id?: string | null;
};

function buildViewUrl(relatedEntityType: string | null | undefined, relatedEntityId: string | null | undefined, appUrl: string): string {
  if (!appUrl) return '#';
  const base = appUrl.replace(/\/$/, '');
  if (relatedEntityType === 'task' && relatedEntityId) return `${base}/tasks/${relatedEntityId}`;
  if (relatedEntityType === 'project' && relatedEntityId) return `${base}/projects/${relatedEntityId}`;
  if (relatedEntityType === 'todo' || relatedEntityType === 'bulletin') return `${base}/todo-notices`;
  return base;
}

function getLinkLabel(relatedEntityType: string | null | undefined): string {
  switch (relatedEntityType) {
    case 'task': return 'View task';
    case 'project': return 'View project';
    case 'todo': return 'View to-do';
    case 'bulletin': return 'View bulletin';
    default: return 'View in app';
  }
}

function getSubjectAndBody(record: NotificationRecord, appUrl: string): { subject: string; html: string } {
  const viewUrl = buildViewUrl(record.related_entity_type, record.related_entity_id, appUrl);
  const linkLabel = getLinkLabel(record.related_entity_type);
  const viewLink = viewUrl && viewUrl !== '#' ? `<p><a href="${viewUrl}">${linkLabel}</a></p>` : '';

  const bodyStyle = 'font-family:sans-serif;line-height:1.5;';
  const baseBody = (title: string, message: string) =>
    `<!DOCTYPE html><html><body style="${bodyStyle}"><p><strong>${title}</strong></p><p>${message}</p>${viewLink}</body></html>`;

  switch (record.type) {
    case 'task_assigned':
      return { subject: 'You were assigned to a task', html: baseBody(record.title, record.message) };
    case 'task_due_soon':
      return { subject: 'Task due soon', html: baseBody(record.title, record.message) };
    case 'task_overdue':
      return { subject: 'Task overdue', html: baseBody(record.title, record.message) };
    case 'review_requested':
      return { subject: 'Review requested', html: baseBody(record.title, record.message) };
    case 'review_completed':
      return { subject: 'Review completed', html: baseBody(record.title, record.message) };
    case 'comment_added':
      return { subject: 'New comment on a task', html: baseBody(record.title, record.message) };
    case 'document_uploaded':
      return { subject: 'New document on a task', html: baseBody(record.title, record.message) };
    case 'todo_completed':
      return { subject: 'To-Do completed', html: baseBody(record.title, record.message) };
    case 'bulletin_posted':
      return { subject: 'New bulletin', html: baseBody(record.title, record.message) };
    case 'project_updated':
      return { subject: 'Project updated', html: baseBody(record.title, record.message) };
    case 'project_closed':
      return { subject: 'Project closed', html: baseBody(record.title, record.message) };
    case 'project_reopened':
      return { subject: 'Project reopened', html: baseBody(record.title, record.message) };
    default:
      return { subject: record.title, html: baseBody(record.title, record.message) };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  let payload: { record?: NotificationRecord; type?: string; table?: string; schema?: string };
  try {
    payload = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Accept either (1) Bearer service role or (2) valid Supabase INSERT webhook payload for notifications
  // so that Dashboard-configured webhooks (which may not send Authorization) still work.
  const authHeader = req.headers.get('Authorization');
  const hasValidBearer = !!(
    authHeader &&
    serviceRoleKey &&
    authHeader.replace('Bearer ', '').trim() === serviceRoleKey
  );
  const looksLikeWebhook =
    payload.type === 'INSERT' &&
    payload.table === 'notifications' &&
    payload.schema === 'public' &&
    payload.record &&
    typeof payload.record === 'object';

  if (!hasValidBearer && !looksLikeWebhook) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const record = payload.record;
  if (!record?.recipient_user_id || !record?.type || !record?.title || !record?.message) {
    console.error('send-notification-email: missing record or required fields', {
      hasRecord: !!record,
      keys: record ? Object.keys(record) : [],
    });
    return new Response(
      JSON.stringify({ error: 'Missing record or required fields: recipient_user_id, type, title, message' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  console.log('send-notification-email: processing', {
    notificationType: record.type,
    recipientUserId: record.recipient_user_id,
  });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set');
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: user, error: userError } = await adminClient
    .from('users')
    .select('email, full_name, deleted_at, is_active, email_notifications_enabled')
    .eq('id', record.recipient_user_id)
    .maybeSingle();

  if (userError || !user?.email || user.deleted_at != null || user.is_active === false) {
    console.log('send-notification-email: skipped – recipient not found or inactive', {
      recipientUserId: record.recipient_user_id,
      userError: userError?.message,
    });
    return new Response(
      JSON.stringify({ skipped: true, reason: 'recipient not found or inactive' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (user.email_notifications_enabled === false) {
    console.log('send-notification-email: skipped – user disabled email notifications', {
      recipientUserId: record.recipient_user_id,
    });
    return new Response(
      JSON.stringify({ skipped: true, reason: 'user disabled email notifications' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) {
    console.error('send-notification-email: RESEND_API_KEY not set');
    return new Response(
      JSON.stringify({ skipped: true, reason: 'Resend not configured' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const appUrl = Deno.env.get('APP_URL') ?? '';
  const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') ?? 'notifications@resend.dev';
  const { subject, html } = getSubjectAndBody(record, appUrl);

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [user.email],
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('send-notification-email: Resend API failed', { status: res.status, body: errText });
      const hint =
        res.status === 403 && errText.includes('domain is not verified')
          ? ' Verify your sending domain at https://resend.com/domains and set RESEND_FROM_EMAIL to an address on that domain.'
          : '';
      return new Response(
        JSON.stringify({ error: 'Failed to send email', details: errText, hint }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('send-notification-email: sent', { to: user.email, type: record.type });
    return new Response(
      JSON.stringify({ sent: true, to: user.email }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('send-notification-email: Resend request error', e);
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
