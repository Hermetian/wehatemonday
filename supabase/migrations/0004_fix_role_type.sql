-- First, create a backup of the role data
CREATE TABLE users_role_backup AS
SELECT id, role FROM users;

-- Drop the existing role column
ALTER TABLE users DROP COLUMN role;

-- Add the new role column as text
ALTER TABLE users ADD COLUMN role text;

-- Restore the role data
UPDATE users u
SET role = b.role::text
FROM users_role_backup b
WHERE u.id = b.id;

-- Drop the backup table
DROP TABLE users_role_backup;

-- Add a check constraint to ensure valid roles
ALTER TABLE users ADD CONSTRAINT valid_role CHECK (role IN ('ADMIN', 'MANAGER', 'AGENT', 'CUSTOMER'));
