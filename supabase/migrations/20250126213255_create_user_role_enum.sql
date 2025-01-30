-- Drop existing triggers and functions
DROP TRIGGER IF EXISTS sync_role_to_auth_trigger ON auth.users;
DROP TRIGGER IF EXISTS sync_user_role_trigger ON users;
DROP FUNCTION IF EXISTS sync_role_to_auth();
DROP FUNCTION IF EXISTS sync_user_role();
DROP FUNCTION IF EXISTS set_claim(claim text, uid uuid, value text);

-- Create the enum type for user roles in the database
CREATE TYPE user_role_enum AS ENUM ('ADMIN', 'MANAGER', 'AGENT', 'CUSTOMER');

-- First drop the default
ALTER TABLE users ALTER COLUMN role DROP DEFAULT;

-- Update existing role column to use the new enum type
-- First convert to text, then to the new enum
ALTER TABLE users 
  ALTER COLUMN role TYPE user_role_enum 
  USING role::text::user_role_enum;

-- Set the new default with the new enum type
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'CUSTOMER'::user_role_enum;

-- Add constraint to ensure role is not null
ALTER TABLE users 
  ALTER COLUMN role SET NOT NULL;

-- Create an index on the role column for better performance
CREATE INDEX users_role_idx ON users(role);

-- Function to set claims in auth.users
CREATE OR REPLACE FUNCTION set_claim(claim text, uid uuid, value text)
RETURNS void AS $$
BEGIN
  UPDATE auth.users
  SET raw_app_meta_data = 
    COALESCE(raw_app_meta_data::jsonb, '{}'::jsonb) || 
    jsonb_build_object(claim, value)
  WHERE id = uid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to sync database role to auth metadata
CREATE OR REPLACE FUNCTION sync_role_to_auth()
RETURNS TRIGGER AS $$
BEGIN
  -- Store role as user_role in the JWT metadata
  UPDATE auth.users 
  SET raw_app_meta_data = 
    COALESCE(raw_app_meta_data::jsonb, '{}'::jsonb) || 
    jsonb_build_object('user_role', NEW.role::text)
  WHERE id = NEW.id;
  
  -- Also set the role claim for backward compatibility
  PERFORM set_claim('role', NEW.id, LOWER(NEW.role::text));
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant execute permission on sync_role_to_auth to authenticated users
GRANT EXECUTE ON FUNCTION sync_role_to_auth TO authenticated;
GRANT EXECUTE ON FUNCTION sync_role_to_auth TO service_role;

-- Create new trigger
CREATE TRIGGER sync_role_to_auth_trigger
  AFTER INSERT OR UPDATE OF role
  ON users
  FOR EACH ROW
  EXECUTE FUNCTION sync_role_to_auth();

-- Drop the old enum type after all conversions are done
DROP TYPE IF EXISTS user_role CASCADE;

-- Revert function
-- DROP TRIGGER IF EXISTS sync_role_to_auth_trigger ON users;
-- DROP TRIGGER IF EXISTS sync_user_role_trigger ON users;
-- DROP FUNCTION IF EXISTS sync_role_to_auth();
-- DROP FUNCTION IF EXISTS sync_user_role();
-- DROP FUNCTION IF EXISTS set_claim(claim text, uid uuid, value text);
-- DROP INDEX IF EXISTS users_role_idx;
-- ALTER TABLE users ALTER COLUMN role DROP NOT NULL;
-- ALTER TABLE users ALTER COLUMN role DROP DEFAULT;
-- ALTER TABLE users ALTER COLUMN role TYPE text;
-- DROP TYPE IF EXISTS user_role_enum CASCADE; 
