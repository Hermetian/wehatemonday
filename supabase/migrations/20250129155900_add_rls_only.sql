-- Add RLS policies only
BEGIN;

-- Enable RLS on tickets table if not already enabled
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DO $$ 
BEGIN
    EXECUTE format('DROP POLICY IF EXISTS admin_manager_ticket_access ON public.tickets');
    EXECUTE format('DROP POLICY IF EXISTS agent_ticket_access ON public.tickets');
    EXECUTE format('DROP POLICY IF EXISTS customer_ticket_access ON public.tickets');
    EXECUTE format('DROP POLICY IF EXISTS service_role_bypass ON public.tickets');
EXCEPTION
    WHEN undefined_object THEN
        NULL;
END $$;

-- Create policies for ticket access
-- 1. Admin and Manager can see all tickets
CREATE POLICY admin_manager_ticket_access ON public.tickets
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
      AND u.role IN ('ADMIN', 'MANAGER')
    )
  );

-- 2. Agents can see tickets they're assigned to, created, or have matching team tags
CREATE POLICY agent_ticket_access ON public.tickets
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
      AND u.role = 'AGENT'
      AND (
        tickets.assigned_to_id = auth.uid()
        OR tickets.created_by_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.team_members tm
          JOIN public.teams t ON t.id = tm.team_id
          WHERE tm.user_id = auth.uid()
          AND tickets.tags && t.tags
        )
      )
    )
  );

-- 3. Customers can only see their own tickets
CREATE POLICY customer_ticket_access ON public.tickets
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
      AND u.role = 'CUSTOMER'
      AND tickets.created_by_id = auth.uid()
    )
  );

-- 4. Service role bypass only when explicitly enabled
CREATE POLICY service_role_bypass ON public.tickets
  FOR ALL
  TO service_role
  USING (
    COALESCE(current_setting('app.bypass_rls', true), 'false')::boolean
  );

COMMIT;
