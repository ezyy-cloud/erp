# Setup Guide - Furbank ERP

This guide will walk you through setting up the Furbank ERP application from scratch.

## Prerequisites

1. **Node.js**: Version 20.19.0+ or 22.12.0+
2. **Supabase Account**: Sign up at https://supabase.com
3. **Git**: For cloning the repository

## Step 1: Supabase Project Setup

1. Create a new Supabase project at https://supabase.com/dashboard
2. Note your project URL and anon key from Settings > API

## Step 2: Database Migration

1. In your Supabase dashboard, navigate to **SQL Editor**
2. Click **New Query**
3. Copy and paste the entire contents of `supabase/migrations/001_initial_schema.sql`
4. Click **Run** to execute the migration
5. Verify the migration succeeded by checking:
   - Tables are created (roles, users, projects, tasks, etc.)
   - Default roles are inserted (senior_consultant, administrator, staff)

## Step 2.5: Seed Admin User

1. **Create the admin user in Supabase Auth first**:
   - Go to **Authentication > Users** in Supabase Dashboard
   - Click **"Add user"** > **"Create new user"**
   - Email: `admin@furbank.com`
   - Password: `Admin@123`
   - **Auto Confirm User**: Yes (important!)
   - Click **"Create user"**
   - Note the user ID (you may need it)

2. **Run the seed migration**:
   - In SQL Editor, create a new query
   - Copy and paste the entire contents of `supabase/migrations/002_seed_admin_user.sql`
   - Click **Run** to execute
   - Verify the admin user was created in the `users` table with `senior_consultant` role

## Step 3: Storage Bucket Setup

1. In Supabase dashboard, go to **Storage**
2. Click **New bucket**
3. Name it: `task-files`
4. Set it to **Public** (or configure RLS policies for authenticated users)
5. Optionally, run `supabase/storage_setup.sql` in SQL Editor to set up storage policies

## Step 4: Environment Configuration

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your Supabase credentials:
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   ```

## Step 5: Install Dependencies

```bash
npm install
```

## Step 6: Start Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:5173`

## Step 7: Sign In as Admin

1. Navigate to the login page at `http://localhost:5173/login`
2. Sign in with the admin credentials:
   - Email: `admin@furbank.com`
   - Password: `Admin@123`
3. You should now be logged in as a Senior Consultant with full access

## Step 8: Create Additional Users

1. **As an admin**, navigate to the **Users** page (visible in navigation)
2. Click **"Create User"**
3. Fill in the form:
   - Email (required)
   - Full Name (required)
   - Role (Staff, Administrator, or Senior Consultant)
   - Choose to generate a random password or set one manually
4. Click **"Create User"**
5. **Important**: The system will display the user's credentials (email and password)
6. Copy these credentials and send them securely to the new user
7. The user can now sign in with these credentials

**Note**: Public signup is disabled. All users must be created by admins through the User Management interface.

## Step 9: Test the Application

1. **As Staff**:
   - Should only see "My Tasks" in navigation
   - Can view assigned tasks
   - Can add comments, notes, and upload files
   - Cannot create tasks or manage users

2. **As Administrator**:
   - Should see "Projects", "Tasks", and "Users" in navigation
   - Can create projects and tasks
   - Can assign tasks to users
   - Can manage task status
   - Can create and manage users
   - Can change user roles and status

3. **As Senior Consultant** (Admin):
   - Should see "Projects", "Tasks", "Users", and "Reports" in navigation
   - Can view all projects and tasks
   - Can create and manage users
   - Full access to all features

## Troubleshooting

### "Missing Supabase environment variables"
- Ensure `.env` file exists and contains `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- Restart the dev server after creating/editing `.env`

### "Error fetching app user"
- Verify the database migration ran successfully
- Check that your user record exists in the `users` table
- Ensure the `role_id` references a valid role
- For admin user: Verify the seed migration ran successfully and the user exists in both `auth.users` and `public.users`

### "Admin user not found" when running seed migration
- Ensure you created the admin user in Supabase Auth (Authentication > Users) before running the seed migration
- The seed migration looks for a user with email `admin@furbank.com` in `auth.users`
- If the email is different, update the seed script accordingly

### "Permission denied" errors
- Check that RLS policies are enabled on all tables
- Verify your user's role is correctly set
- Check browser console for specific error messages

### File uploads not working
- Ensure the `task-files` storage bucket exists
- Verify the bucket is set to public or has proper RLS policies
- Check that storage policies allow authenticated uploads

## Next Steps

- Review the README.md for architecture details
- Explore the codebase structure
- Customize the application for your needs
- Plan future ERP module additions
