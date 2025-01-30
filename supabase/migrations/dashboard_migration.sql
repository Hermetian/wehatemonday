-- Begin transaction
BEGIN;

-- Step 1: Handle the column type conversion
DO $$
BEGIN
  -- First drop the default
  ALTER TABLE public.users 
    ALTER COLUMN role DROP DEFAULT;
  
  -- Then convert the column to text to preserve the values
  ALTER TABLE public.users 
    ALTER COLUMN role TYPE text;
  
  -- Then convert it back to the user_role enum
  ALTER TABLE public.users 
    ALTER COLUMN role TYPE user_role USING role::user_role;
    
  -- Finally set the default back as the enum type
  ALTER TABLE public.users 
    ALTER COLUMN role SET DEFAULT 'CUSTOMER'::user_role;
END $$;

-- Step 2: Create a function to sync auth.users metadata with user_role
CREATE OR REPLACE FUNCTION public.sync_user_role()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE auth.users
  SET raw_app_meta_data = jsonb_set(
    COALESCE(raw_app_meta_data, '{}'::jsonb),
    '{user_role}',
    to_jsonb(NEW.role)
  )
  WHERE id = NEW.id::uuid;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to keep auth metadata in sync
DROP TRIGGER IF EXISTS sync_user_role_trigger ON public.users;
CREATE TRIGGER sync_user_role_trigger
  AFTER INSERT OR UPDATE OF role
  ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_user_role();

-- Step 3: Drop all existing RLS policies
DO $$ 
DECLARE
  pol record;
BEGIN
  FOR pol IN 
    SELECT schemaname, tablename, policyname
    FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename IN ('audit_logs', 'messages', 'team_members', 'teams', 'tickets', 'users')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', 
      pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;

-- Disable RLS on all tables
DO $$ 
DECLARE
  tbl text;
BEGIN
  FOR tbl IN 
    SELECT tablename 
    FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename IN ('audit_logs', 'messages', 'team_members', 'teams', 'tickets', 'users')
  LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', tbl);
  END LOOP;
END $$;

-- Update existing users' metadata
UPDATE auth.users u
SET raw_app_meta_data = jsonb_set(
  COALESCE(raw_app_meta_data, '{}'::jsonb),
  '{user_role}',
  to_jsonb(users.role)
)
FROM public.users
WHERE u.id = users.id::uuid;

COMMIT;