# Troubleshooting Login Issues

## Error: "Invalid login credentials" (400)

This error occurs when the admin user doesn't exist in Supabase Auth or email confirmation is required.

## Solution: Create Admin User in Supabase

### Step 1: Create Admin User in Supabase Auth

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/gqyigihstsxligqmsrwc
2. Navigate to **Authentication** > **Users**
3. Click **"Add user"** button (top right)
4. Select **"Create new user"**
5. Fill in:
   - **Email**: `cloud.architect@ezyy.cloud`
   - **Password**: (set in Dashboard)
   - **Auto Confirm User**: ✅ **YES** (This is critical!)
   - **Send invitation email**: ❌ No (optional)
6. Click **"Create user"**

### Step 2: Disable Email Confirmation (Important!)

1. In Supabase Dashboard, go to **Authentication** > **Settings**
2. Scroll to **"Email Auth"** section
3. Find **"Enable email confirmations"**
4. **Disable** this setting (toggle it off)
5. This allows users to sign in immediately without email verification

### Step 3: Run the Seed Migration

1. Go to **SQL Editor** in Supabase Dashboard
2. Click **"New query"**
3. Copy and paste the entire contents of `supabase/migrations/002_seed_admin_user.sql`
4. Click **"Run"**
5. You should see a success message: "Admin user seeded successfully"

### Step 4: Verify the User

1. Go to **Table Editor** > **users**
2. You should see a user with:
   - Email: `cloud.architect@ezyy.cloud`
   - Full Name: `System Administrator`
   - Role: Should have `senior_consultant` role

### Step 5: Try Logging In Again

1. Go to your app: `http://localhost:5173/login`
2. Enter:
   - Email: `cloud.architect@ezyy.cloud`
   - Password: (set in Dashboard)
3. Click **"Sign In"**

## Alternative: Check Existing Users

If you already created a user, you can:

1. Go to **Authentication** > **Users** in Supabase Dashboard
2. Check if any users exist
3. If a user exists, you can:
   - Reset their password
   - Or use their existing credentials

## Still Having Issues?

1. **Check browser console** for more detailed error messages
2. **Verify environment variables** in `.env`:
   ```
   VITE_SUPABASE_URL=https://gqyigihstsxligqmsrwc.supabase.co
   VITE_SUPABASE_ANON_KEY=your_anon_key
   ```
3. **Restart the dev server** after changing `.env`
4. **Clear browser cache/localStorage** and try again
