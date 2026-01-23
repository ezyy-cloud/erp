# Supabase Edge Functions - Complete Setup

## What Are Edge Functions?

Supabase Edge Functions are serverless functions that run on Deno Deploy. They have access to the **service role key**, which allows them to perform admin operations that the frontend cannot do, such as:
- Creating users in `auth.users` 
- Resetting passwords in `auth.users`
- Other operations requiring Admin API access

## Location

Edge Functions are located in:
```
supabase/functions/
├── create-user/
│   └── index.ts          # Creates new users
└── reset-user-password/
    └── index.ts          # Resets user passwords
```

## Quick Start

### 1. Install Supabase CLI

```bash
# macOS
brew install supabase/tap/supabase

# Or using npm
npm install -g supabase
```

### 2. Login

```bash
supabase login
```

### 3. Link Project

```bash
cd furbank-erp-web
supabase link --project-ref zfvywfujvguzvlmlxfae
```

Enter your database password when prompted (found in Supabase Dashboard → Settings → Database).

### 4. Deploy

```bash
# Deploy both functions
supabase functions deploy create-user
supabase functions deploy reset-user-password
```

## How It Works

### Frontend Flow

1. **User Creation:**
   - Admin clicks "Create User" in the UI
   - Frontend calls `createUser()` in `userService.ts`
   - Function tries Edge Function first: `POST /functions/v1/create-user`
   - If Edge Function unavailable, falls back to `signUp()` method

2. **Password Reset:**
   - Admin clicks "Reset Password" on a user
   - Frontend calls `resetUserPassword()` in `userService.ts`
   - Function tries Edge Function: `POST /functions/v1/reset-user-password`
   - Edge Function generates password and sets it in `auth.users`
   - Returns password to admin
   - If Edge Function unavailable, generates password but doesn't set it

### Edge Function Security

Both functions:
1. ✅ Verify the caller is authenticated (checks Authorization header)
2. ✅ Verify the caller is admin/super_admin (checks role in database)
3. ✅ Use service role key (automatically available, never exposed to frontend)
4. ✅ Perform the admin operation securely

## Function Details

### `create-user`

**Endpoint:** `https://zfvywfujvguzvlmlxfae.supabase.co/functions/v1/create-user`

**Request:**
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

### `reset-user-password`

**Endpoint:** `https://zfvywfujvguzvlmlxfae.supabase.co/functions/v1/reset-user-password`

**Request:**
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

## Environment Variables

Edge Functions automatically have access to:
- `SUPABASE_URL` - Your project URL
- `SUPABASE_ANON_KEY` - Your anon key  
- `SUPABASE_SERVICE_ROLE_KEY` - Your service role key (set automatically)

**You don't need to manually set these** - they're available in the Edge Function runtime.

## Local Development (Optional)

To test functions locally:

```bash
# Start local Supabase (optional)
supabase start

# Serve a function locally
supabase functions serve create-user
supabase functions serve reset-user-password
```

Functions will be available at `http://localhost:54321/functions/v1/<function-name>`

## Verification

After deployment:

1. Go to **Supabase Dashboard → Edge Functions**
2. You should see both functions listed as "Active"
3. Test in the UI:
   - Create a user → Should work without signing you in
   - Reset a password → Should automatically set the password

## Troubleshooting

**404 Error:**
- Function not deployed: `supabase functions deploy <function-name>`
- Check function name matches exactly

**401 Unauthorized:**
- User not authenticated
- Check Authorization header is being sent

**403 Forbidden:**
- User is not admin/super_admin
- Check user's role in `users` table

**500 Error:**
- Check Edge Function logs in Supabase Dashboard
- Verify service role key is available (should be automatic)

## Benefits

✅ **Security:** Service role key never exposed to frontend  
✅ **No Auto-Sign-In:** Creating users doesn't sign you into their account  
✅ **Automatic Password Setting:** Passwords are set in `auth.users` automatically  
✅ **Fallback:** Frontend gracefully falls back if functions aren't deployed  

## Next Steps

1. Deploy the functions using the commands above
2. Test user creation and password reset in the UI
3. Functions will automatically be used when available
