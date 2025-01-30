-- Enable pg_cron extension
BEGIN;

-- First check if we have permission to create extensions
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_extension
        WHERE extname = 'pg_cron'
    ) THEN
        -- Try to create the extension
        CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
        
        -- Grant usage to postgres (superuser)
        GRANT USAGE ON SCHEMA cron TO postgres;
        
        -- Create the cron job for RLS error cleanup
        SELECT cron.schedule(
            'clean-rls-errors',  -- job name
            '0 0 * * *',        -- daily at midnight
            'SELECT clean_old_rls_errors();'
        );
    END IF;
END $$;

COMMIT;
