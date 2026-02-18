# Supabase Edge Functions Setup Guide

This guide explains how to set up and deploy Supabase Edge Functions for user management operations that require Admin API access.

## What are Edge Functions?

Supabase Edge Functions are serverless functions that run on Deno Deploy. They have access to the Supabase service role key, which allows them to perform admin operations like:
- Creating users in `auth.users`
- Resetting user passwords
- Other operations that require elevated privileges

## Prerequisites

1. **Supabase CLI** installed
2. **Deno** installed (comes with Supabase CLI)
3. **Service Role Key** from your Supabase project

## Installation

### 1. Install Supabase CLI

```bash
# macOS
brew install supabase/tap/supabase

# Or using npm
npm install -g supabase
```

### 2. Login to Supabase

```bash
supabase login
```

### 3. Link Your Project

```bash
cd web-app
supabase link --project-ref gqyigihstsxligqmsrwc
```

You'll be prompted for your database password (found in Supabase Dashboard → Settings → Database).

## Edge Functions Structure

The edge functions are located in:
```
supabase/functions/
├── create-user/
│   └── index.ts
└── reset-user-password/
    └── index.ts
```

## Available Functions

### 1. `create-user`
Creates a new user in both `auth.users` and `public.users` tables.

**Endpoint:** `https://your-project.supabase.co/functions/v1/create-user`

**Method:** POST

**Headers:**
- `Authorization: Bearer <user_access_token>`
- `Content-Type: application/json`
- `apikey: <anon_key>`

**Body:**
```json
{
  "email": "user@example.com",
  "fullName": "John Doe",
  "role": "user",
  "password": "SecurePassword123!"
}
```

**Response:**
```json
{
  "success": true,
  "userId": "uuid",
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

### 2. `reset-user-password`
Resets a user's password in `auth.users`.

**Endpoint:** `https://your-project.supabase.co/functions/v1/reset-user-password`

**Method:** POST

**Headers:**
- `Authorization: Bearer <user_access_token>`
- `Content-Type: application/json`
- `apikey: <anon_key>`

**Body:**
```json
{
  "userId": "user-uuid"
}
```

**Response:**
```json
{
  "success": true,
  "userId": "user-uuid",
  "email": "user@example.com",
  "password": "NewGeneratedPassword123!"
}
```

## Deployment

### Deploy All Functions

```bash
supabase functions deploy
```

### Deploy Specific Function

```bash
# Deploy create-user function
supabase functions deploy create-user

# Deploy reset-user-password function
supabase functions deploy reset-user-password
```

### Set Environment Variables

The functions need access to your Supabase credentials. These are automatically available when deployed, but you can also set them explicitly:

```bash
# Set service role key (required for admin operations)
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# These are usually set automatically, but you can verify:
supabase secrets list
```

**Important:** Never commit your service role key to git! It's automatically available in the Edge Function runtime.

### Resend (Email Notifications)

To send onboarding and in-app notification emails via [Resend](https://resend.com):

1. **Resend account**: Sign up at resend.com, verify your sending domain, and create an API key.
2. **Supabase secrets** (required for notification emails):

   ```bash
   # Required for create-user welcome email and send-notification-email
   supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxx

   # Optional: From address for emails (defaults to Resend's if not set)
   supabase secrets set RESEND_FROM_EMAIL=notifications@yourdomain.com

   # Optional: App base URL for "View in app" links in notification emails (e.g. https://app.example.com)
   supabase secrets set APP_URL=https://your-app-url.com
   ```

3. **Verification**: After deployment, create a user or trigger a notification and check Resend's dashboard for sent emails.

### Database Webhook: Notifications → Email

The webhook that invokes `send-notification-email` on every INSERT into `notifications` is **created programmatically** by migration `053_enable_notifications_realtime_and_email.sql`. It uses `pg_net` to POST the new row to the Edge Function asynchronously.

**No manual Dashboard setup is required.** After running `supabase db push`, every INSERT into `notifications` will trigger the Edge Function automatically.

**Optional (not recommended):** You can also create a Database Webhook manually in Supabase Dashboard → Database → Webhooks. Do **not** do both—the migration trigger and a Dashboard webhook would both fire, causing duplicate emails. If you use a different Supabase project (e.g. staging), update the URL in the migration before applying.



### Resend notifications not arriving

1. **Migration applied?** Ensure migration `053_enable_notifications_realtime_and_email.sql` has been applied (`supabase db push`). It creates a trigger that invokes the Edge Function on every `notifications` INSERT.
2. **Secrets set?** Run `supabase secrets list` and ensure `RESEND_API_KEY` is set. Redeploy the function after setting secrets: `supabase functions deploy send-notification-email`.
3. **Resend "from" domain:** To send to arbitrary recipient emails you must verify your own domain in Resend and set `RESEND_FROM_EMAIL` to an address on that domain (e.g. `notifications@yourdomain.com`). The default `onboarding@resend.dev` / `notifications@resend.dev` is for testing and may only deliver to your Resend account email.
4. **Edge Function logs:** In Supabase Dashboard → Edge Functions → `send-notification-email` → Logs, look for lines like `send-notification-email: processing`, `send-notification-email: sent`, or `send-notification-email: skipped – ...` to see whether the webhook is firing and why emails might be skipped.
5. **Resend dashboard:** In resend.com → Emails, check for sent/failed/delivered status and any error messages.

## Local Development

### Start Local Supabase (Optional)

```bash
supabase start
```

### Test Functions Locally

```bash
# Test create-user function
supabase functions serve create-user

# Test reset-user-password function
supabase functions serve reset-user-password
```

Then call them at `http://localhost:54321/functions/v1/<function-name>`

## Environment Variables

The Edge Functions automatically have access to:
- `SUPABASE_URL` - Your project URL
- `SUPABASE_ANON_KEY` - Your anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Your service role key (set via secrets)
- `RESEND_API_KEY` - (Optional) Resend API key for sending notification emails; set via `supabase secrets set RESEND_API_KEY=...`
- `RESEND_FROM_EMAIL` - (Optional) From address for emails
- `APP_URL` - (Optional) App base URL for links in emails

## Security

1. **Authentication Required**: Both functions verify the caller is authenticated
2. **Role Check**: Both functions verify the caller is an admin or super_admin
3. **Service Role Key**: Only used server-side, never exposed to frontend
4. **CORS**: Configured to allow requests from your frontend

## Troubleshooting

### Function Not Found (404)
- Ensure the function is deployed: `supabase functions deploy <function-name>`
- Check the function name matches exactly

### Unauthorized (401)
- Ensure you're passing a valid access token in the Authorization header
- Token must be from an authenticated user

### Forbidden (403)
- User must be an admin or super_admin
- Check the user's role in the `users` table

### Service Role Key Missing
- The key is automatically available in deployed functions
- For local testing, you may need to set it: `supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...`

## Production Deployment

1. Deploy functions:
   ```bash
   supabase functions deploy create-user
   supabase functions deploy reset-user-password
   ```

2. Verify deployment:
   - Go to Supabase Dashboard → Edge Functions
   - You should see both functions listed

3. Test the functions:
   - Use the frontend UI to create a user or reset a password
   - Check the browser console for any errors

## Next Steps

After deploying, the frontend will automatically use the Edge Functions when available. The `userService.ts` already has fallback logic if the functions aren't deployed yet.
