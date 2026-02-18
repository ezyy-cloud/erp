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
