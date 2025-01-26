-- Create helper function to get user clade from JWT
CREATE OR REPLACE FUNCTION get_jwt_clade() RETURNS text AS $$
DECLARE
    claims jsonb;
BEGIN
    claims := current_setting('request.jwt.claims', true)::jsonb;
    RETURN coalesce(
        claims->>'role',  -- First try to get the role directly
        (claims->>'app_metadata')::jsonb->>'clade'  -- Then try app_metadata.clade
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing sync function and trigger
DROP TRIGGER IF EXISTS sync_user_clade_trigger ON users;
DROP FUNCTION IF EXISTS sync_user_clade;

-- Enable RLS on the users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies that check clade from users table
DROP POLICY IF EXISTS "Users can view their own profile" ON users;
DROP POLICY IF EXISTS "Users can update their own profile" ON users;
DROP POLICY IF EXISTS "Admins can manage all users" ON users;
DROP POLICY IF EXISTS "Staff can view all teams" ON teams;
DROP POLICY IF EXISTS "Managers and admins can manage teams" ON teams;
DROP POLICY IF EXISTS "Staff can view all team members" ON team_members;
DROP POLICY IF EXISTS "Staff can manage messages" ON messages;
DROP POLICY IF EXISTS "Staff can view audit logs" ON audit_logs;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can delete profiles" ON users;
DROP POLICY IF EXISTS "Users can insert profiles" ON users;

-- Create new policies based on JWT claims
CREATE POLICY "Users can view their own profile"
ON users FOR SELECT
TO authenticated
USING (
    auth.uid() = id OR  -- User can always view their own profile
    get_jwt_clade() IN ('AGENT', 'MANAGER', 'ADMIN')  -- These roles can view all profiles
);

CREATE POLICY "Users can update their own profile"
ON users FOR UPDATE
TO authenticated
USING (
    auth.uid() = id OR  -- User can always update their own profile
    get_jwt_clade() IN ('MANAGER', 'ADMIN')  -- These roles can update all profiles
);

CREATE POLICY "Users can delete profiles"
ON users FOR DELETE
TO authenticated
USING (
    get_jwt_clade() = 'ADMIN'  -- Only admins can delete profiles
);

CREATE POLICY "Users can insert profiles"
ON users FOR INSERT
TO authenticated
WITH CHECK (
    get_jwt_clade() = 'ADMIN'  -- Only admins can create new profiles
);

-- Ensure all users have their clade in auth metadata
DO $$
BEGIN
    UPDATE auth.users u
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('clade', pu.clade::text)
    FROM public.users pu
    WHERE u.id = pu.id
    AND (u.raw_app_meta_data->>'clade' IS NULL OR u.raw_app_meta_data->>'clade' != pu.clade::text);
END $$;
