# Ezyy ERP - Task Management System

A production-ready task management application designed to evolve incrementally into a full ERP system. Built with React, TypeScript, and Supabase.

## Features

- **Closed Authentication System**: No public signup - admins create users who receive credentials
- **Role-Based Access Control (RBAC)**: Three distinct roles (Senior Consultant, Administrator, Staff) with granular permissions
- **User Management**: Admins can create, manage, and assign roles to users
- **Project Management**: Create and manage projects
- **Task Management**: Full task lifecycle with status tracking, priorities, and assignments
- **Task Interactions**: Comments, notes, and file uploads
- **Security**: Row Level Security (RLS) enforced at the database level
- **Responsive Design**: Desktop-first with mobile-friendly responsive views
- **Clean UI**: Black and white color scheme, minimal and professional

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL, Auth, Storage)
- **Routing**: React Router
- **UI Components**: Custom components built with Radix UI primitives

## Getting Started

### Prerequisites

- Node.js 20.19.0+ or 22.12.0+
- npm or yarn
- Supabase account and project

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd ezyy-erp/web-app
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

Edit `.env` and add your Supabase credentials:
```
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

4. Set up the database:
   - In your Supabase dashboard, go to SQL Editor
   - Run the migration file: `supabase/migrations/001_initial_schema.sql`
   - This will create all necessary tables, RLS policies, and default roles
   - Run the seed migration: `supabase/migrations/002_seed_admin_user.sql`
   - **Important**: Before running the seed migration, create the admin user in Supabase Auth:
     - Go to Authentication > Users
     - Click "Add user" > "Create new user"
     - Email: `cloud.architect@ezyy.cloud`
     - Password: (set in Dashboard)
     - Auto Confirm User: Yes
     - Copy the user ID and update the seed script if needed

5. Set up Storage:
   - In Supabase Dashboard, go to Storage
   - Create a new bucket named `task-files`
   - Set it to public (or configure RLS policies for authenticated users)
   - This bucket will store uploaded task files

6. Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5173`

## Database Schema

The application uses a normalized schema with the following main tables:

- **roles**: System roles (senior_consultant, administrator, staff)
- **users**: User profiles linked to Supabase Auth
- **projects**: Project records
- **project_members**: Many-to-many relationship between users and projects
- **tasks**: Task records with status, priority, and assignment
- **task_comments**: Threaded comments on tasks
- **task_notes**: Editable notes on tasks (version-ready)
- **task_files**: File uploads linked to tasks

All tables include audit fields (created_at, updated_at, created_by) for future expansion.

## Role Permissions

### Senior Consultant
- View all projects and tasks
- Create and edit projects and tasks
- Assign tasks
- Create and manage users
- View reports (placeholder for future)
- Full oversight capabilities

### Administrator
- View all projects and tasks
- Create and edit projects and tasks
- Assign tasks
- Manage task status
- Create and manage users
- Cannot delete projects/tasks (consultant-only)
- Cannot change system permissions

### Staff
- View assigned tasks only
- Add comments to accessible tasks
- Add notes to accessible tasks
- Upload files to accessible tasks
- Cannot create or assign tasks
- Cannot manage users

## Project Structure

```
src/
├── components/
│   ├── layout/          # App layout and navigation
│   └── ui/              # Reusable UI components
├── contexts/            # React contexts (Auth)
├── lib/
│   ├── rbac/           # RBAC permission system
│   └── supabase/       # Supabase client and types
├── pages/              # Page components
└── App.tsx             # Main app component with routing
```

## Security

Security is enforced at three levels:

1. **UI Level**: Components check permissions before rendering
2. **API Level**: Supabase client enforces RLS policies
3. **Database Level**: Row Level Security (RLS) policies ensure data isolation

All RLS policies are defined in the migration file and enforce role-based access patterns.

## Development Guidelines

- Follow clean architecture principles
- Keep components reusable and maintainable
- Write clear comments explaining "why", not just "what"
- Prefer clarity over cleverness
- Design for future ERP expansion

## Future ERP Modules

The architecture is designed to support future modules:
- Time tracking
- Billing and invoicing
- CRM
- Asset management
- HR
- Reporting & analytics

## Building for Production

```bash
npm run build
```

The built files will be in the `dist/` directory.

## License

[Your License Here]
