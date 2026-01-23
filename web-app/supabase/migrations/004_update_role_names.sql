-- Update Role Names
-- Changes: senior_consultant -> super_admin, administrator -> admin, staff -> user
-- This migration updates the role names in the database

-- Update role names
UPDATE roles SET name = 'super_admin' WHERE name = 'senior_consultant';
UPDATE roles SET name = 'admin' WHERE name = 'administrator';
UPDATE roles SET name = 'user' WHERE name = 'staff';

-- Update role descriptions
UPDATE roles SET description = 'Highest level - can see all projects and tasks, assign tasks, view reports' WHERE name = 'super_admin';
UPDATE roles SET description = 'Operational manager - creates projects, tasks, assigns tasks, manages status' WHERE name = 'admin';
UPDATE roles SET description = 'Execution role - views assigned tasks, adds comments, notes, uploads documents' WHERE name = 'user';

-- Verify the update
SELECT id, name, description FROM roles ORDER BY 
  CASE name
    WHEN 'super_admin' THEN 1
    WHEN 'admin' THEN 2
    WHEN 'user' THEN 3
  END;
