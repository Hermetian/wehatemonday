-- Add RLS policies for users table
BEGIN;

-- Enable RLS on users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DO $$ 
BEGIN
    EXECUTE format('DROP POLICY IF EXISTS users_read_access ON public.users');
EXCEPTION
    WHEN undefined_object THEN
        NULL;
END $$;

-- Create policy to allow authenticated users to read user data
-- This is needed for ticket queries that join with users table
CREATE POLICY users_read_access ON public.users
    FOR SELECT
    TO authenticated
    USING (true);  -- Allow reading all user records since they're needed for ticket info

COMMIT;
