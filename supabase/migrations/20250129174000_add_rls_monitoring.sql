-- Migration to add RLS monitoring table
BEGIN;

-- Create RLS errors table
CREATE TABLE IF NOT EXISTS public.rls_errors (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id),
    role text NOT NULL,
    action text NOT NULL,
    resource text NOT NULL,
    error text NOT NULL,
    created_at timestamptz DEFAULT now(),
    
    CONSTRAINT valid_role CHECK (role IN ('ADMIN', 'MANAGER', 'AGENT', 'CUSTOMER'))
);

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_rls_errors_created_at ON public.rls_errors(created_at);
CREATE INDEX IF NOT EXISTS idx_rls_errors_user_role ON public.rls_errors(user_id, role);

-- Enable RLS on the errors table
ALTER TABLE public.rls_errors ENABLE ROW LEVEL SECURITY;

-- Only allow service role to insert
CREATE POLICY insert_rls_errors ON public.rls_errors
    FOR INSERT
    TO service_role
    WITH CHECK (true);

-- Only allow admins to view
CREATE POLICY view_rls_errors ON public.rls_errors
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid()
            AND u.role = 'ADMIN'
        )
    );

-- Add function to clean old errors
CREATE OR REPLACE FUNCTION clean_old_rls_errors()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM public.rls_errors
    WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$;

-- Note: To automatically clean old errors, you can either:
-- 1. Enable the pg_cron extension and schedule the job:
--    SELECT cron.schedule('clean-rls-errors', '0 0 * * *', 'SELECT clean_old_rls_errors();');
-- 2. Set up an external cron job to call this function periodically:
--    curl -X POST https://your-project.supabase.co/rest/v1/rpc/clean_old_rls_errors -H "apikey: your-anon-key"

COMMIT;
