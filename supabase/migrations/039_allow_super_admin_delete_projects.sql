-- Migration 039: Allow Super Admin to delete projects

DROP POLICY IF EXISTS "Super admin can delete projects" ON projects;

CREATE POLICY "Super admin can delete projects" ON projects
  FOR DELETE
  USING (
    public.user_has_role(ARRAY['super_admin'])
  );
