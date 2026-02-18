-- Migration 036: Report Audit Logging
-- Creates audit table for tracking report generation events
-- Ensures accountability and traceability for all report access

-- ============================================
-- 1. Create report_audit_log table
-- ============================================
CREATE TABLE IF NOT EXISTS report_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  generated_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  report_type VARCHAR(100) NOT NULL,
  report_params JSONB, -- Store filter parameters, user/project IDs, date ranges, etc.
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  file_size_bytes BIGINT, -- Size of generated PDF
  generation_duration_ms INTEGER, -- Time taken to generate report
  status VARCHAR(50) DEFAULT 'success', -- success, failed, cancelled
  error_message TEXT, -- If generation failed
  CONSTRAINT report_audit_log_report_type_check 
    CHECK (report_type IN (
      'user_performance',
      'task_lifecycle',
      'project',
      'company_wide'
    ))
);

-- ============================================
-- 2. Create indexes for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_report_audit_log_generated_by 
  ON report_audit_log(generated_by);
CREATE INDEX IF NOT EXISTS idx_report_audit_log_report_type 
  ON report_audit_log(report_type);
CREATE INDEX IF NOT EXISTS idx_report_audit_log_generated_at 
  ON report_audit_log(generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_audit_log_status 
  ON report_audit_log(status);

-- ============================================
-- 3. Add comments
-- ============================================
COMMENT ON TABLE report_audit_log IS 'Audit log for all PDF report generation events. Tracks who generated what report, when, and with what parameters.';
COMMENT ON COLUMN report_audit_log.report_type IS 'Type of report: user_performance, task_lifecycle, project, company_wide';
COMMENT ON COLUMN report_audit_log.report_params IS 'JSON object containing filter parameters used for report generation';
COMMENT ON COLUMN report_audit_log.generation_duration_ms IS 'Time taken to generate the report in milliseconds';

-- ============================================
-- 4. Row Level Security (RLS)
-- ============================================
ALTER TABLE report_audit_log ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Super admins can view all report audit logs" ON report_audit_log;
DROP POLICY IF EXISTS "Users can view own report audit logs" ON report_audit_log;

-- Only Super Admins can view audit logs
CREATE POLICY "Super admins can view all report audit logs" ON report_audit_log
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = auth.uid()
      AND r.name = 'super_admin'
    )
  );

-- Users can view their own generated reports
CREATE POLICY "Users can view own report audit logs" ON report_audit_log
  FOR SELECT 
  USING (generated_by = auth.uid());

-- Only system can insert (via Edge Functions with service role)
-- No policy needed - Edge Functions use service role which bypasses RLS

-- ============================================
-- 5. Helper function: Log report generation
-- ============================================
CREATE OR REPLACE FUNCTION public.log_report_generation(
  p_generated_by UUID,
  p_report_type VARCHAR(100),
  p_report_params JSONB DEFAULT NULL,
  p_file_size_bytes BIGINT DEFAULT NULL,
  p_generation_duration_ms INTEGER DEFAULT NULL,
  p_status VARCHAR(50) DEFAULT 'success',
  p_error_message TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO report_audit_log (
    generated_by,
    report_type,
    report_params,
    file_size_bytes,
    generation_duration_ms,
    status,
    error_message
  ) VALUES (
    p_generated_by,
    p_report_type,
    p_report_params,
    p_file_size_bytes,
    p_generation_duration_ms,
    p_status,
    p_error_message
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.log_report_generation(
  UUID, VARCHAR, JSONB, BIGINT, INTEGER, VARCHAR, TEXT
) TO authenticated;

COMMENT ON FUNCTION public.log_report_generation IS 'Logs a report generation event. Should be called by Edge Functions after generating a report.';
