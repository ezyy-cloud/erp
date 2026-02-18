# Quick Guide: Deploy Edge Functions

## Step 1: Install Supabase CLI

```bash
# macOS
brew install supabase/tap/supabase

# Or using npm
npm install -g supabase
```

## Step 2: Login to Supabase

```bash
supabase login
```

This will open your browser to authenticate.

## Step 3: Link Your Project

```bash
cd web-app
supabase link --project-ref gqyigihstsxligqmsrwc
```

When prompted, enter your database password (found in Supabase Dashboard → Settings → Database).

## Step 4: Deploy Functions

```bash
# Deploy both functions
supabase functions deploy create-user
supabase functions deploy reset-user-password
```

## Step 5: Verify Deployment

1. Go to Supabase Dashboard → Edge Functions
2. You should see both `create-user` and `reset-user-password` functions listed
3. They should show as "Active"

## That's It!

After deployment, the frontend will automatically use these functions. The functions:
- ✅ Verify the caller is authenticated
- ✅ Check that the caller is an admin/super_admin
- ✅ Use the service role key (automatically available) to perform admin operations
- ✅ Return the generated password to the admin

## Testing

1. Try creating a user in the Users page - it should use the Edge Function
2. Try resetting a password - it should automatically set the password in auth.users

## Troubleshooting

**Function returns 404:**
- Make sure you deployed: `supabase functions deploy <function-name>`
- Check the function name matches exactly

**Function returns 401/403:**
- Ensure you're logged in as an admin/super_admin
- Check your access token is valid

**Service role key error:**
- The service role key is automatically available in Edge Functions
- You don't need to set it manually
