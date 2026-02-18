-- Migration 048: Bulletins & Team To-Dos
-- Lightweight coordination layer separate from formal task lifecycle
-- Provides:
-- - Company-wide bulletin board notices
-- - Simple multi-assignee team to-do list with per-user completion

-- ============================================
-- 1. Bulletins Table
-- ============================================

CREATE TABLE IF NOT EXISTS bulletins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

COMMENT ON TABLE bulletins IS 'Company-wide bulletin notices for quick, informational announcements.';
COMMENT ON COLUMN bulletins.title IS 'Short title for the bulletin notice.';
COMMENT ON COLUMN bulletins.body IS 'Full body text for the bulletin notice.';
COMMENT ON COLUMN bulletins.creator_id IS 'User who created the bulletin notice.';
COMMENT ON COLUMN bulletins.expires_at IS 'Optional expiry timestamp. Notices are hidden after this time.';
COMMENT ON COLUMN bulletins.deleted_at IS 'Soft-delete timestamp. NULL means active.';

-- Indexes for common filters
CREATE INDEX IF NOT EXISTS idx_bulletins_expires_at ON bulletins (expires_at);
CREATE INDEX IF NOT EXISTS idx_bulletins_deleted_at ON bulletins (deleted_at);
CREATE INDEX IF NOT EXISTS idx_bulletins_created_at ON bulletins (created_at DESC);

-- Enable RLS
ALTER TABLE bulletins ENABLE ROW LEVEL SECURITY;

-- Helper: all authenticated users can view active, non-expired bulletins
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'bulletins'
      AND policyname = 'Authenticated users can view active bulletins'
  ) THEN
    CREATE POLICY "Authenticated users can view active bulletins" ON bulletins
      FOR SELECT
      TO authenticated
      USING (
        deleted_at IS NULL
        AND (expires_at IS NULL OR expires_at > NOW())
      );
  END IF;
END $$;

-- Only admins and super_admins can manage bulletins
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'bulletins'
      AND policyname = 'Admins can manage bulletins'
  ) THEN
    CREATE POLICY "Admins can manage bulletins" ON bulletins
      FOR ALL
      TO authenticated
      USING (
        public.user_has_role(ARRAY['admin', 'super_admin'])
      )
      WITH CHECK (
        public.user_has_role(ARRAY['admin', 'super_admin'])
      );
  END IF;
END $$;

-- updated_at trigger
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_bulletins_updated_at'
      AND tgrelid = 'bulletins'::regclass
  ) THEN
    CREATE TRIGGER update_bulletins_updated_at
      BEFORE UPDATE ON bulletins
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ============================================
-- 2. Team To-Do Tables
-- ============================================

CREATE TABLE IF NOT EXISTS todo_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  text TEXT NOT NULL,
  creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

COMMENT ON TABLE todo_items IS 'Lightweight team to-do items for operational reminders (non-project, non-task).';
COMMENT ON COLUMN todo_items.text IS 'One-sentence to-do text.';
COMMENT ON COLUMN todo_items.creator_id IS 'User who created the to-do item.';
COMMENT ON COLUMN todo_items.deleted_at IS 'Soft-delete timestamp. NULL means active.';

CREATE INDEX IF NOT EXISTS idx_todo_items_deleted_at ON todo_items (deleted_at);
CREATE INDEX IF NOT EXISTS idx_todo_items_created_at ON todo_items (created_at DESC);

ALTER TABLE todo_items ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view active to-dos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'todo_items'
      AND policyname = 'Authenticated users can view active todos'
  ) THEN
    CREATE POLICY "Authenticated users can view active todos" ON todo_items
      FOR SELECT
      TO authenticated
      USING (deleted_at IS NULL);
  END IF;
END $$;

-- Only admins and super_admins can create/update/delete todo items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'todo_items'
      AND policyname = 'Admins can manage todos'
  ) THEN
    CREATE POLICY "Admins can manage todos" ON todo_items
      FOR ALL
      TO authenticated
      USING (
        public.user_has_role(ARRAY['admin', 'super_admin'])
      )
      WITH CHECK (
        public.user_has_role(ARRAY['admin', 'super_admin'])
      );
  END IF;
END $$;

-- updated_at trigger
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_todo_items_updated_at'
      AND tgrelid = 'todo_items'::regclass
  ) THEN
    CREATE TRIGGER update_todo_items_updated_at
      BEFORE UPDATE ON todo_items
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ============================================
-- 2b. To-Do Assignees
-- ============================================

CREATE TABLE IF NOT EXISTS todo_assignees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  todo_id UUID NOT NULL REFERENCES todo_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (todo_id, user_id)
);

COMMENT ON TABLE todo_assignees IS 'Join table mapping to-do items to assigned users.';

CREATE INDEX IF NOT EXISTS idx_todo_assignees_todo_id ON todo_assignees (todo_id);
CREATE INDEX IF NOT EXISTS idx_todo_assignees_user_id ON todo_assignees (user_id);

ALTER TABLE todo_assignees ENABLE ROW LEVEL SECURITY;

-- All authenticated users can see assignees for visible todos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'todo_assignees'
      AND policyname = 'Users can view todo assignees'
  ) THEN
    CREATE POLICY "Users can view todo assignees" ON todo_assignees
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM todo_items ti
          WHERE ti.id = todo_assignees.todo_id
            AND ti.deleted_at IS NULL
        )
      );
  END IF;
END $$;

-- Only admins and super_admins can manage assignments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'todo_assignees'
      AND policyname = 'Admins can manage todo assignees'
  ) THEN
    CREATE POLICY "Admins can manage todo assignees" ON todo_assignees
      FOR ALL
      TO authenticated
      USING (
        public.user_has_role(ARRAY['admin', 'super_admin'])
      )
      WITH CHECK (
        public.user_has_role(ARRAY['admin', 'super_admin'])
      );
  END IF;
END $$;

-- ============================================
-- 2c. To-Do Completions (Per-User)
-- ============================================

CREATE TABLE IF NOT EXISTS todo_completions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  todo_id UUID NOT NULL REFERENCES todo_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (todo_id, user_id)
);

COMMENT ON TABLE todo_completions IS 'Per-user completion state for todo_items. Presence of row = completed.';

CREATE INDEX IF NOT EXISTS idx_todo_completions_todo_id ON todo_completions (todo_id);
CREATE INDEX IF NOT EXISTS idx_todo_completions_user_id ON todo_completions (user_id);

ALTER TABLE todo_completions ENABLE ROW LEVEL SECURITY;

-- All authenticated users can see completion state for visible todos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'todo_completions'
      AND policyname = 'Users can view todo completions'
  ) THEN
    CREATE POLICY "Users can view todo completions" ON todo_completions
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM todo_items ti
          WHERE ti.id = todo_completions.todo_id
            AND ti.deleted_at IS NULL
        )
      );
  END IF;
END $$;

-- Only assigned users can insert/update/delete their own completion rows
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'todo_completions'
      AND policyname = 'Assigned users can manage their todo completions'
  ) THEN
    CREATE POLICY "Assigned users can manage their todo completions" ON todo_completions
      FOR ALL
      TO authenticated
      USING (
        user_id = auth.uid()
        AND EXISTS (
          SELECT 1
          FROM todo_assignees ta
          JOIN todo_items ti ON ti.id = ta.todo_id
          WHERE ta.todo_id = todo_completions.todo_id
            AND ta.user_id = auth.uid()
            AND ti.deleted_at IS NULL
        )
      )
      WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
          SELECT 1
          FROM todo_assignees ta
          JOIN todo_items ti ON ti.id = ta.todo_id
          WHERE ta.todo_id = todo_completions.todo_id
            AND ta.user_id = auth.uid()
            AND ti.deleted_at IS NULL
        )
      );
  END IF;
END $$;

