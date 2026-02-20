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
  if (relatedEntityType === 'todo' || relatedEntityType === 'bulletin') return `${base}/bulletin-board`;
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

function getSubject(type: string): string {
  switch (type) {
    case 'task_assigned': return 'You were assigned to a task';
    case 'task_due_soon': return 'Task due soon';
    case 'task_overdue': return 'Task overdue';
    case 'review_requested': return 'Review requested';
    case 'review_completed': return 'Review completed';
    case 'comment_added': return 'New comment on a task';
    case 'note_added': return 'New note on a task';
    case 'document_uploaded': return 'New document on a task';
    case 'todo_completed': return 'To-Do completed';
    case 'bulletin_posted': return 'New bulletin';
    case 'project_updated': return 'Project updated';
    case 'project_closed': return 'Project closed';
    case 'project_reopened': return 'Project reopened';
    default: return 'Notification';
  }
}

function buildEmailHtml(record: NotificationRecord, appUrl: string): string {
  const viewUrl = buildViewUrl(record.related_entity_type, record.related_entity_id, appUrl);
  const linkLabel = getLinkLabel(record.related_entity_type);
  const hasLink = viewUrl && viewUrl !== '#';

  const buttonHtml = hasLink
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;">
        <tr>
          <td style="border-radius:6px;background-color:#18181b;">
            <a href="${viewUrl}" target="_blank" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">${linkLabel} &rarr;</a>
          </td>
        </tr>
      </table>`
    : '';

  const dashboardUrl = appUrl ? `${appUrl.replace(/\/$/, '')}/dashboard` : '';
  const footerLink = dashboardUrl
    ? `<a href="${dashboardUrl}" style="color:#71717a;text-decoration:underline;">Open Dashboard</a>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f4f4f5;">
    <tr>
      <td style="padding:32px 16px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:520px;margin:0 auto;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <tr>
            <td style="padding:32px 28px;">
              <h1 style="margin:0 0 8px 0;font-size:18px;font-weight:700;color:#18181b;">${record.title}</h1>
              <p style="margin:0 0 4px 0;font-size:14px;line-height:1.6;color:#3f3f46;">${record.message}</p>
              ${buttonHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;background-color:#fafafa;border-top:1px solid #e4e4e7;">
              <p style="margin:0;font-size:12px;color:#a1a1aa;">
                This is an automated notification from Ezyy ERP.${footerLink ? ` ${footerLink}` : ''}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function getSubjectAndBody(record: NotificationRecord, appUrl: string): { subject: string; html: string } {
  return {
    subject: getSubject(record.type),
    html: buildEmailHtml(record, appUrl),
  };
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
