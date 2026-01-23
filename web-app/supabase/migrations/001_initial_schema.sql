-- Furbank ERP - Initial Schema
-- This schema is designed to evolve into a full ERP system
-- All tables use UUIDs and include audit fields for future expansion

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Roles table
-- Stores the three core roles: super_admin, admin, user
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default roles
INSERT INTO roles (name, description) VALUES
  ('super_admin', 'Highest level - can see all projects and tasks, assign tasks, view reports'),
  ('admin', 'Operational manager - creates projects, tasks, assigns tasks, manages status'),
  ('user', 'Execution role - views assigned tasks, adds comments, notes, uploads documents');

-- Users table (extends Supabase auth.users)
-- Links to Supabase auth via auth.uid()
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(255),
  role_id UUID REFERENCES roles(id) ON DELETE RESTRICT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  CONSTRAINT users_role_fk FOREIGN KEY (role_id) REFERENCES roles(id)
);

-- Projects table
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'active', -- active, completed, archived
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Project members table
-- Links users to projects (many-to-many)
-- Future-ready for department/company expansion
CREATE TABLE project_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'member', -- member, lead, viewer
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE(project_id, user_id)
);

-- Tasks table
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'to_do', -- to_do, in_progress, blocked, done
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  due_date TIMESTAMPTZ,
  priority VARCHAR(20) DEFAULT 'medium', -- low, medium, high, urgent
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Task comments table (threaded, chronological)
CREATE TABLE task_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  parent_comment_id UUID REFERENCES task_comments(id) ON DELETE CASCADE, -- For threading
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Task notes table (editable, version-ready)
CREATE TABLE task_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  version INTEGER DEFAULT 1, -- For future versioning
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Task files table
-- References files stored in Supabase Storage
CREATE TABLE task_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL, -- Storage path
  file_size BIGINT,
  mime_type VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Indexes for performance
CREATE INDEX idx_users_role_id ON users(role_id);
CREATE INDEX idx_projects_created_by ON projects(created_by);
CREATE INDEX idx_project_members_project_id ON project_members(project_id);
CREATE INDEX idx_project_members_user_id ON project_members(user_id);
CREATE INDEX idx_tasks_project_id ON tasks(project_id);
CREATE INDEX idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_task_comments_task_id ON task_comments(task_id);
CREATE INDEX idx_task_comments_parent_id ON task_comments(parent_comment_id);
CREATE INDEX idx_task_notes_task_id ON task_notes(task_id);
CREATE INDEX idx_task_files_task_id ON task_files(task_id);

-- Row Level Security (RLS) Policies
-- Enable RLS on all tables
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_files ENABLE ROW LEVEL SECURITY;

-- Roles: Everyone can read (for role checking)
CREATE POLICY "Roles are viewable by everyone" ON roles
  FOR SELECT USING (true);

-- Users: Users can see their own record and users in their projects
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Senior consultants can view all users" ON users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role_id = (SELECT id FROM roles WHERE name = 'super_admin')
    )
  );

CREATE POLICY "Admins can view all users" ON users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role_id = (SELECT id FROM roles WHERE name = 'admin')
    )
  );

CREATE POLICY "Users can view project members" ON users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM project_members pm2
        WHERE pm2.project_id = pm.project_id
        AND pm2.user_id = users.id
      )
    )
  );

-- Projects: Visibility based on role
CREATE POLICY "Senior consultants can view all projects" ON projects
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role_id = (SELECT id FROM roles WHERE name = 'super_admin')
    )
  );

CREATE POLICY "Admins can view all projects" ON projects
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role_id = (SELECT id FROM roles WHERE name = 'admin')
    )
  );

CREATE POLICY "Users can view projects they are members of" ON projects
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_id = projects.id
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Admins and consultants can create projects" ON projects
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role_id IN (
        SELECT id FROM roles WHERE name IN ('admin', 'super_admin')
      )
    )
  );

CREATE POLICY "Admins and consultants can update projects" ON projects
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role_id IN (
        SELECT id FROM roles WHERE name IN ('admin', 'super_admin')
      )
    )
  );

-- Project members: Based on project access
CREATE POLICY "Users can view members of accessible projects" ON project_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND (
        role_id = (SELECT id FROM roles WHERE name = 'super_admin')
        OR role_id = (SELECT id FROM roles WHERE name = 'admin')
        OR EXISTS (
          SELECT 1 FROM project_members pm
          WHERE pm.project_id = project_members.project_id
          AND pm.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Admins and consultants can manage project members" ON project_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role_id IN (
        SELECT id FROM roles WHERE name IN ('admin', 'super_admin')
      )
    )
  );

-- Tasks: Role-based access
CREATE POLICY "Senior consultants can view all tasks" ON tasks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role_id = (SELECT id FROM roles WHERE name = 'super_admin')
    )
  );

CREATE POLICY "Admins can view all tasks" ON tasks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role_id = (SELECT id FROM roles WHERE name = 'admin')
    )
  );

CREATE POLICY "Users can view assigned tasks" ON tasks
  FOR SELECT USING (assigned_to = auth.uid());

CREATE POLICY "Users can view tasks in their projects" ON tasks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_id = tasks.project_id
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Admins and consultants can create tasks" ON tasks
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role_id IN (
        SELECT id FROM roles WHERE name IN ('admin', 'super_admin')
      )
    )
  );

CREATE POLICY "Admins and consultants can update tasks" ON tasks
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role_id IN (
        SELECT id FROM roles WHERE name IN ('admin', 'super_admin')
      )
    )
  );

-- Task comments: Users can view comments for tasks they can see
CREATE POLICY "Users can view comments for accessible tasks" ON task_comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_comments.task_id
      AND (
        t.assigned_to = auth.uid()
        OR EXISTS (
          SELECT 1 FROM users
          WHERE id = auth.uid()
          AND role_id IN (
            SELECT id FROM roles WHERE name IN ('admin', 'super_admin')
          )
        )
        OR EXISTS (
          SELECT 1 FROM project_members pm
          WHERE pm.project_id = t.project_id
          AND pm.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can create comments on accessible tasks" ON task_comments
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_comments.task_id
      AND (
        t.assigned_to = auth.uid()
        OR EXISTS (
          SELECT 1 FROM users
          WHERE id = auth.uid()
          AND role_id IN (
            SELECT id FROM roles WHERE name IN ('admin', 'super_admin')
          )
        )
        OR EXISTS (
          SELECT 1 FROM project_members pm
          WHERE pm.project_id = t.project_id
          AND pm.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can update own comments" ON task_comments
  FOR UPDATE USING (user_id = auth.uid());

-- Task notes: Similar to comments
CREATE POLICY "Users can view notes for accessible tasks" ON task_notes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_notes.task_id
      AND (
        t.assigned_to = auth.uid()
        OR EXISTS (
          SELECT 1 FROM users
          WHERE id = auth.uid()
          AND role_id IN (
            SELECT id FROM roles WHERE name IN ('admin', 'super_admin')
          )
        )
        OR EXISTS (
          SELECT 1 FROM project_members pm
          WHERE pm.project_id = t.project_id
          AND pm.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can create notes on accessible tasks" ON task_notes
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_notes.task_id
      AND (
        t.assigned_to = auth.uid()
        OR EXISTS (
          SELECT 1 FROM users
          WHERE id = auth.uid()
          AND role_id IN (
            SELECT id FROM roles WHERE name IN ('admin', 'super_admin')
          )
        )
        OR EXISTS (
          SELECT 1 FROM project_members pm
          WHERE pm.project_id = t.project_id
          AND pm.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can update own notes" ON task_notes
  FOR UPDATE USING (user_id = auth.uid());

-- Task files: Similar access pattern
CREATE POLICY "Users can view files for accessible tasks" ON task_files
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_files.task_id
      AND (
        t.assigned_to = auth.uid()
        OR EXISTS (
          SELECT 1 FROM users
          WHERE id = auth.uid()
          AND role_id IN (
            SELECT id FROM roles WHERE name IN ('admin', 'super_admin')
          )
        )
        OR EXISTS (
          SELECT 1 FROM project_members pm
          WHERE pm.project_id = t.project_id
          AND pm.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can upload files to accessible tasks" ON task_files
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_files.task_id
      AND (
        t.assigned_to = auth.uid()
        OR EXISTS (
          SELECT 1 FROM users
          WHERE id = auth.uid()
          AND role_id IN (
            SELECT id FROM roles WHERE name IN ('admin', 'super_admin')
          )
        )
        OR EXISTS (
          SELECT 1 FROM project_members pm
          WHERE pm.project_id = t.project_id
          AND pm.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can delete own files" ON task_files
  FOR DELETE USING (user_id = auth.uid() OR created_by = auth.uid());

-- Functions for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_task_comments_updated_at BEFORE UPDATE ON task_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_task_notes_updated_at BEFORE UPDATE ON task_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
