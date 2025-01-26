-- Rename user_role type to user_clade
ALTER TYPE user_role RENAME TO user_clade;

-- Rename role column to clade
ALTER TABLE users RENAME COLUMN role TO clade;

-- Rename role index to clade index
ALTER INDEX idx_users_role RENAME TO idx_users_clade;
