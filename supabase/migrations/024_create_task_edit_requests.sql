-- Migration 024: Create Task Edit Requests Table
-- Implements controlled task editing workflow: Admin requests edits, Super Admin approves/rejects
-- This maintains task immutability while allowing controlled exceptions with full audit trails

-- Create task_edit_requests table
CREATE TABLE IF NOT EXISTS task_edit_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL NOT NULL,
  proposed_changes JSONB NOT NULL, -- Structured JSON: {title?, description?, due_date?, priority?, assignees?}
  status VARCHAR(50) DEFAULT 'pending' NOT NULL, -- 'pending', 'approved', 'rejected'
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  comments TEXT, -- Reviewer comments (approval or rejection reason)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add check constraint for status
ALTER TABLE task_edit_requests
  ADD CONSTRAINT task_edit_requests_status_check
  CHECK (status IN ('pending', 'approved', 'rejected'));

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_task_edit_requests_task_id ON task_edit_requests(task_id);
CREATE INDEX IF NOT EXISTS idx_task_edit_requests_requested_by ON task_edit_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_task_edit_requests_status ON task_edit_requests(status);
CREATE INDEX IF NOT EXISTS idx_task_edit_requests_reviewed_by ON task_edit_requests(reviewed_by);
CREATE INDEX IF NOT EXISTS idx_task_edit_requests_created_at ON task_edit_requests(created_at DESC);

-- Add comment for documentation
COMMENT ON TABLE task_edit_requests IS 'Edit requests for tasks. Admins can request edits, only Super Admin can approve/reject. Immutable audit trail.';
COMMENT ON COLUMN task_edit_requests.proposed_changes IS 'JSONB with fields: title?, description?, due_date?, priority?, assignees? (array of user IDs)';
COMMENT ON COLUMN task_edit_requests.status IS 'Request status: pending (awaiting review), approved (changes applied), rejected (changes not applied)';

-- Enable RLS
ALTER TABLE task_edit_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Admins and Super Admins can view all edit requests
CREATE POLICY "Admins and Super Admins can view all edit requests" ON task_edit_requests
  FOR SELECT USING (
    public.user_has_role(ARRAY['super_admin', 'admin'])
  );

-- RLS Policy: Users can view their own edit requests
CREATE POLICY "Users can view own edit requests" ON task_edit_requests
  FOR SELECT USING (
    requested_by = auth.uid()
  );

-- RLS Policy: Admins and Super Admins can create edit requests
CREATE POLICY "Admins and Super Admins can create edit requests" ON task_edit_requests
  FOR INSERT WITH CHECK (
    requested_by = auth.uid()
    AND public.user_has_role(ARRAY['super_admin', 'admin'])
  );

-- RLS Policy: Only Super Admin can update (approve/reject) edit requests
CREATE POLICY "Super Admin can update edit requests" ON task_edit_requests
  FOR UPDATE USING (
    public.user_has_role(ARRAY['super_admin'])
  )
  WITH CHECK (
    public.user_has_role(ARRAY['super_admin'])
  );

-- No delete policy - edit requests are immutable for audit purposes
-- This ensures full audit trail of all edit requests

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_task_edit_request_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER task_edit_requests_updated_at
  BEFORE UPDATE ON task_edit_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_task_edit_request_updated_at();
