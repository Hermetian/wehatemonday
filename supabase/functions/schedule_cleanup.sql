-- Enable the pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Drop existing schedule if it exists
SELECT cron.unschedule('cleanup-expired-test-data');

-- Schedule the cleanup function to run every 4 hours
SELECT cron.schedule(
  'cleanup-expired-test-data',
  '0 */4 * * *',  -- Run at minute 0 past every 4th hour
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/cleanup-expired-test-data',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
        'Content-Type', 'application/json'
      )
    ) as request_id;
  $$
); 