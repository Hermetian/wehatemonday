-- Add LangSmith configuration and processing queue tables
BEGIN;

-- Create enum for processing status
CREATE TYPE processing_status AS ENUM ('pending', 'processing', 'completed', 'error');

-- Create table for LangSmith runs
CREATE TABLE IF NOT EXISTS public.langsmith_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_time TIMESTAMPTZ,
    extra JSONB,
    error TEXT,
    execution_order INTEGER NOT NULL DEFAULT 1,
    serialized JSONB,
    outputs JSONB,
    parent_run_id TEXT REFERENCES public.langsmith_runs(run_id),
    tags TEXT[] DEFAULT '{}'::TEXT[],
    inputs JSONB
);

-- Enable RLS
ALTER TABLE public.langsmith_runs ENABLE ROW LEVEL SECURITY;

-- Grant access to authenticated users
GRANT ALL ON public.langsmith_runs TO authenticated;

-- Create policies
CREATE POLICY "Allow service role full access" ON public.langsmith_runs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow users to view all runs" ON public.langsmith_runs
    FOR SELECT
    TO authenticated
    USING (true);

-- Update marketplace_conversations table to use the new enum
-- First add a temporary column
ALTER TABLE public.marketplace_conversations 
    ADD COLUMN status_new processing_status;

-- Update the new column based on the old status
UPDATE public.marketplace_conversations
SET status_new = CASE status
    WHEN 'pending' THEN 'pending'::processing_status
    WHEN 'processing' THEN 'processing'::processing_status
    WHEN 'completed' THEN 'completed'::processing_status
    WHEN 'error' THEN 'error'::processing_status
    ELSE 'pending'::processing_status
END;

-- Set constraints on new column
ALTER TABLE public.marketplace_conversations 
    ALTER COLUMN status_new SET NOT NULL,
    ALTER COLUMN status_new SET DEFAULT 'pending'::processing_status;

-- Drop the old column
ALTER TABLE public.marketplace_conversations 
    DROP COLUMN status;

-- Rename the new column
ALTER TABLE public.marketplace_conversations 
    RENAME COLUMN status_new TO status;

-- Create function for getting error stats
CREATE OR REPLACE FUNCTION public.get_error_stats(limit_count integer)
RETURNS TABLE (
    error_code text,
    error_message text,
    count bigint
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        rls_errors.error_code,
        rls_errors.error_message,
        COUNT(*) as count
    FROM rls_errors
    GROUP BY error_code, error_message
    ORDER BY count DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function for getting daily error metrics
CREATE OR REPLACE FUNCTION public.get_daily_error_metrics(start_date timestamptz)
RETURNS TABLE (
    table_name text,
    operation text,
    error_count bigint
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        rls_errors.table_name,
        rls_errors.operation,
        COUNT(*) as error_count
    FROM rls_errors
    WHERE timestamp >= start_date
    GROUP BY table_name, operation
    ORDER BY error_count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION public.get_error_stats(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_error_metrics(timestamptz) TO authenticated;

COMMIT;
