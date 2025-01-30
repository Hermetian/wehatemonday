-- Enable RLS and add policies for users table
BEGIN;

-- Enable RLS on users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS users_read_access ON public.users;

-- Create policy to allow authenticated users to read user data
-- This is needed for ticket RLS policies that join with users table
CREATE POLICY users_read_access ON public.users
    FOR SELECT
    TO authenticated
    USING (true);  -- Allow all authenticated users to read user data

COMMIT;
