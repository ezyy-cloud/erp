# Architecture Overview

## System Architecture

The Furbank ERP is built with a clean, layered architecture designed for incremental expansion into a full ERP system.

### Frontend Architecture

```
┌─────────────────────────────────────┐
│         React Application           │
├─────────────────────────────────────┤
│  Pages (Routes)                     │
│  ├── Login                          │
│  ├── Projects                       │
│  ├── Tasks                          │
│  ├── TaskDetail                     │
│  └── Reports                        │
├─────────────────────────────────────┤
│  Components                         │
│  ├── Layout (Navigation, AppLayout) │
│  └── UI (Button, Card, Input, etc.) │
├─────────────────────────────────────┤
│  Contexts                           │
│  └── AuthContext (Auth + RBAC)      │
├─────────────────────────────────────┤
│  Libraries                          │
│  ├── RBAC (Permissions)             │
│  └── Supabase (Client, Types)       │
└─────────────────────────────────────┘
```

### Backend Architecture (Supabase)

```
┌─────────────────────────────────────┐
│         Supabase Platform           │
├─────────────────────────────────────┤
│  Authentication                     │
│  └── Email/Password Auth            │
├─────────────────────────────────────┤
│  PostgreSQL Database                │
│  ├── Tables (Normalized Schema)    │
│  ├── RLS Policies (Security)        │
│  └── Functions & Triggers           │
├─────────────────────────────────────┤
│  Storage                            │
│  └── task-files Bucket              │
└─────────────────────────────────────┘
```

## Security Layers

### 1. UI Level (Frontend)
- Components check `permissions` object before rendering
- Navigation items hidden based on role
- Forms disabled for unauthorized actions

### 2. API Level (Supabase Client)
- All queries go through Supabase client
- RLS policies automatically enforced
- No direct database access from frontend

### 3. Database Level (RLS Policies)
- Row Level Security enabled on all tables
- Policies enforce role-based access patterns
- Data isolation guaranteed at database level

## Data Flow

### Authentication Flow
1. User signs in → Supabase Auth
2. Auth context fetches user profile from `users` table
3. Role and permissions calculated
4. UI adapts based on permissions

### Task Access Flow
1. User requests tasks → Supabase query
2. RLS policy checks:
   - Senior Consultant: All tasks
   - Administrator: All tasks
   - Staff: Only assigned tasks
3. Results filtered by policy
4. UI displays accessible tasks only

## Database Schema Design

### Normalization
- Separate tables for each entity
- Foreign key relationships
- Audit fields on all tables
- UUID primary keys for scalability

### Key Relationships
```
users ←→ roles (many-to-one)
users ←→ project_members ←→ projects (many-to-many)
projects ←→ tasks (one-to-many)
tasks ←→ task_comments (one-to-many)
tasks ←→ task_notes (one-to-many)
tasks ←→ task_files (one-to-many)
```

### Future-Ready Design
- `project_members` supports multi-company expansion
- Audit fields support compliance requirements
- Normalized schema supports complex queries
- UUIDs enable distributed systems

## RBAC Implementation

### Permission Matrix

| Feature | Senior Consultant | Administrator | Staff |
|---------|------------------|---------------|-------|
| View All Projects | ✅ | ✅ | ❌ |
| Create Projects | ✅ | ✅ | ❌ |
| View All Tasks | ✅ | ✅ | ❌ |
| Create Tasks | ✅ | ✅ | ❌ |
| Assign Tasks | ✅ | ✅ | ❌ |
| Add Comments | ✅ | ✅ | ✅ |
| Add Notes | ✅ | ✅ | ✅ |
| Upload Files | ✅ | ✅ | ✅ |
| View Reports | ✅ | ❌ | ❌ |

### Permission Checking
```typescript
// In components
const { permissions } = useAuth();
if (permissions.canCreateTasks) {
  // Show create button
}

// In RLS policies
CREATE POLICY "..." ON tasks
  FOR SELECT USING (
    -- Check role via users table
    EXISTS (SELECT 1 FROM users WHERE ...)
  );
```

## Scalability Considerations

### Current Design Supports:
- Multi-project workflows
- Team collaboration
- File storage
- Audit trails

### Future Expansion Points:
- **Time Tracking**: Add `time_entries` table
- **Billing**: Add `invoices`, `invoice_items` tables
- **CRM**: Add `contacts`, `companies` tables
- **HR**: Add `employees`, `departments` tables
- **Assets**: Add `assets`, `asset_assignments` tables

### Performance Optimizations:
- Indexes on foreign keys
- Indexes on frequently queried fields
- Efficient RLS policy queries
- Pagination-ready queries

## Code Organization

### Principles
1. **Separation of Concerns**: UI, business logic, and data access separated
2. **Reusability**: Components designed for reuse
3. **Type Safety**: Full TypeScript coverage
4. **Maintainability**: Clear structure and comments

### File Structure
```
src/
├── components/        # Reusable UI components
├── contexts/         # React contexts (state management)
├── lib/              # Utilities and configurations
│   ├── rbac/        # Permission system
│   └── supabase/    # Database client and types
├── pages/           # Page components (routes)
└── App.tsx          # Root component with routing
```

## Development Workflow

1. **Database Changes**: Add migration files in `supabase/migrations/`
2. **Type Updates**: Update `src/lib/supabase/types.ts`
3. **Feature Development**: Add pages/components as needed
4. **Permission Updates**: Modify `src/lib/rbac/permissions.ts`
5. **RLS Policies**: Update in migration files

## Testing Strategy (Future)

- Unit tests for permission logic
- Integration tests for RLS policies
- E2E tests for critical workflows
- Performance tests for queries

## Deployment Considerations

- Environment variables for Supabase config
- Build process: `npm run build`
- Static hosting: Vercel, Netlify, etc.
- Database migrations: Run via Supabase dashboard
- Storage bucket: Configure in Supabase dashboard
