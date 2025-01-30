-- RLS Test Script
-- Run this in Supabase SQL editor to verify RLS policies

-- Set client_min_messages to NOTICE to ensure we see debug output
SET client_min_messages TO NOTICE;

-- 0. Setup RLS policies
DO $$
BEGIN
    RAISE NOTICE 'Starting RLS setup...';
END $$;

BEGIN;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create auth schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS auth;

-- Create auth.users table if it doesn't exist
CREATE TABLE IF NOT EXISTS auth.users (
    id uuid PRIMARY KEY,
    email text
);

-- Create auth.uid() function if it doesn't exist
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid 
LANGUAGE plpgsql STABLE
AS $$
DECLARE
    _claims json;
    _subject text;
BEGIN
    _claims := current_setting('request.jwt.claims', true)::json;
    RAISE NOTICE 'Current claims: %', _claims;
    _subject := _claims->>'sub';
    RAISE NOTICE 'Extracted subject: %', _subject;
    IF _subject IS NULL THEN
        RETURN NULL;
    END IF;
    RETURN _subject::uuid;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error in auth.uid(): %', SQLERRM;
    RETURN NULL;
END;
$$;

-- Enable RLS on tickets table
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS tickets_policy ON public.tickets;
DROP POLICY IF EXISTS service_role_bypass ON public.tickets;

-- Reset role to postgres to ensure we have all permissions
SET ROLE postgres;

-- Grant necessary permissions to authenticated role
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT ALL ON public.tickets TO authenticated;
GRANT ALL ON public.users TO authenticated;
GRANT ALL ON public.teams TO authenticated;
GRANT ALL ON public.team_members TO authenticated;
GRANT SELECT ON auth.users TO authenticated;

-- Create a simple policy for testing
CREATE POLICY tickets_policy ON public.tickets
  FOR ALL
  TO authenticated
  USING (
    -- Debug: Check if auth.uid() works
    auth.uid() IS NOT NULL
  );

-- Create service role bypass policy
CREATE POLICY service_role_bypass ON public.tickets
  FOR ALL
  TO service_role
  USING (
    COALESCE(current_setting('app.bypass_rls', true), 'false')::boolean
  );

DO $$
BEGIN
    RAISE NOTICE 'Setup complete. Created schemas, tables, functions, and policies.';
END $$;

COMMIT;

-- Test auth.uid() function
DO $$
DECLARE
    test_id uuid;
    ticket_id uuid;
    ticket_count int;
    auth_user record;
    public_user record;
    ticket_record record;
    found_ticket record;
    found_user record;
    jwt_claims json;
BEGIN
    RAISE NOTICE E'\n=== Starting Test ===';
    
    -- Create test user
    INSERT INTO auth.users (id, email) VALUES 
        (gen_random_uuid(), 'test@example.com') RETURNING id INTO test_id;

    RAISE NOTICE 'Created auth user with ID: %', test_id;

    INSERT INTO public.users (id, email, role) VALUES 
        (test_id, 'test@example.com', 'ADMIN');

    RAISE NOTICE 'Created public user with same ID';

    -- Verify user exists in both tables
    RAISE NOTICE E'\n=== User Creation Debug ===';
    RAISE NOTICE 'Checking auth.users:';
    FOR auth_user IN SELECT id::text, email FROM auth.users WHERE id::text = test_id::text LOOP
        RAISE NOTICE 'auth user: id=%, email=%', auth_user.id, auth_user.email;
    END LOOP;

    RAISE NOTICE 'Checking public.users:';
    FOR public_user IN SELECT id::text, email, role FROM public.users WHERE id::text = test_id::text LOOP
        RAISE NOTICE 'public user: id=%, email=%, role=%', public_user.id, public_user.email, public_user.role;
    END LOOP;

    -- Create test ticket
    INSERT INTO public.tickets (
        title,
        description,
        description_html,
        status,
        priority,
        customer_id,
        created_by_id,
        assigned_to_id,
        tags
    ) VALUES (
        'Test Ticket',
        'Test Description',
        '<p>Test Description</p>',
        'OPEN',
        'MEDIUM',
        test_id,
        test_id,
        test_id,
        ARRAY['test']
    ) RETURNING id INTO ticket_id;

    RAISE NOTICE E'\n=== Ticket Creation Debug ===';
    RAISE NOTICE 'Created ticket with ID: %', ticket_id;

    -- Verify ticket exists
    RAISE NOTICE 'Checking tickets table as postgres:';
    FOR ticket_record IN SELECT id::text, title, customer_id::text, created_by_id::text 
        FROM public.tickets WHERE id::text = ticket_id::text 
    LOOP
        RAISE NOTICE 'ticket: id=%, title=%, customer=%, creator=%', 
            ticket_record.id, ticket_record.title, ticket_record.customer_id, ticket_record.created_by_id;
    END LOOP;

    -- Debug: Check tickets without RLS
    SET ROLE postgres;
    SELECT COUNT(*) INTO ticket_count FROM public.tickets;
    RAISE NOTICE 'Tickets visible as postgres (no RLS): %', ticket_count;

    -- Test authenticated access
    SET SESSION ROLE authenticated;
    
    -- Set JWT claims
    jwt_claims := json_build_object(
        'sub', test_id,
        'role', 'authenticated',
        'email', 'test@example.com'
    );
    
    EXECUTE format(
        'SET LOCAL request.jwt.claims = %L',
        jwt_claims::text
    );
    
    -- Debug: Check auth state
    RAISE NOTICE E'\n=== Auth Debug ===';
    RAISE NOTICE 'Current auth.uid(): %', auth.uid();
    RAISE NOTICE 'JWT claims: %', current_setting('request.jwt.claims', true);
    RAISE NOTICE 'Current user: %', current_user;
    RAISE NOTICE 'Current role: %', current_role;
    
    -- Debug: Check tickets with RLS
    SELECT COUNT(*) INTO ticket_count FROM public.tickets;
    RAISE NOTICE 'Tickets visible to authenticated user: %', ticket_count;

    -- Debug: Try to see tickets directly
    RAISE NOTICE E'\n=== Ticket Visibility Debug ===';
    RAISE NOTICE 'Trying to view tickets as authenticated user:';
    FOR found_ticket IN SELECT id::text, title FROM public.tickets LOOP
        RAISE NOTICE 'Found ticket: id=%, title=%', found_ticket.id, found_ticket.title;
    END LOOP;

    -- Debug: Check RLS policy evaluation
    RAISE NOTICE E'\n=== RLS Policy Debug ===';
    RAISE NOTICE 'auth.uid() IS NOT NULL evaluates to: %', auth.uid() IS NOT NULL;
    RAISE NOTICE 'Checking if user exists in public.users:';
    FOR found_user IN SELECT id::text, role FROM public.users WHERE id::text = auth.uid()::text LOOP
        RAISE NOTICE 'Found user: id=%, role=%', found_user.id, found_user.role;
    END LOOP;

    -- Cleanup
    SET ROLE postgres;
    DELETE FROM public.tickets WHERE id::text = ticket_id::text;
    DELETE FROM public.users WHERE id = test_id;
    DELETE FROM auth.users WHERE id = test_id;
    
    RAISE NOTICE E'\n=== Test Complete ===';
END $$;
