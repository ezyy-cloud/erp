-- Verify and Fix Admin User Role
-- Run this to check and fix the admin user's role

-- First, check current state
SELECT 
  u.id,
  u.email,
  u.role_id,
  r.name as role_name,
  r.description
FROM public.users u
LEFT JOIN roles r ON u.role_id = r.id
WHERE u.email = 'admin@furbank.com';

-- Update admin user to have super_admin role
UPDATE public.users
SET role_id = (SELECT id FROM roles WHERE name = 'super_admin')
WHERE email = 'admin@furbank.com'
AND (
  role_id IS NULL 
  OR role_id != (SELECT id FROM roles WHERE name = 'super_admin')
);

-- Verify the update
SELECT 
  u.id,
  u.email,
  u.role_id,
  r.name as role_name,
  r.description
FROM public.users u
LEFT JOIN roles r ON u.role_id = r.id
WHERE u.email = 'admin@furbank.com';

-- Also verify all roles exist
SELECT id, name, description FROM roles ORDER BY name;
