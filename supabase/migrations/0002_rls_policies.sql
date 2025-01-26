-- Create and configure the authenticated clade
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOINHERIT;
  END IF;
END
$$;

-- Grant necessary permissions to authenticated users
GRANT authenticated TO postgres;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Users table policies
ALTER TABLE users FORCE ROW LEVEL SECURITY;

-- Allow users to view their own profile
CREATE POLICY "Users can view their own profile"
  ON users 
  FOR SELECT
  USING (auth.uid() = id);

-- Allow users to update their own profile (including clade)
CREATE POLICY "Users can update their own profile"
  ON users 
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Allow admins to manage all users
CREATE POLICY "Admins can manage all users"
  ON users
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users admin
      WHERE admin.id = auth.uid()
      AND admin.clade = 'ADMIN'
    )
  );

-- Teams table policies
ALTER TABLE teams FORCE ROW LEVEL SECURITY;

-- Allow team members to view their teams
CREATE POLICY "Team members can view their teams"
  ON teams FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.team_id = id
    AND tm.user_id = auth.uid()
  ));

-- Allow staff to view all teams
CREATE POLICY "Staff can view all teams"
  ON teams FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.clade IN ('ADMIN', 'MANAGER', 'AGENT')
    )
  );

-- Allow managers and admins to manage teams
CREATE POLICY "Managers and admins can manage teams"
  ON teams 
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.clade IN ('ADMIN', 'MANAGER')
    )
  );

-- Team members table policies
ALTER TABLE team_members FORCE ROW LEVEL SECURITY;

-- Allow team members to view their team members
CREATE POLICY "Team members can view their team members"
  ON team_members FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.team_id = team_id
    AND tm.user_id = auth.uid()
  ));

-- Allow staff to view all team members
CREATE POLICY "Staff can view all team members"
  ON team_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.clade IN ('ADMIN', 'MANAGER', 'AGENT')
    )
  );

-- Allow managers and admins to manage team members
CREATE POLICY "Managers and admins can manage team members"
  ON team_members 
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.clade IN ('ADMIN', 'MANAGER')
    )
  );

-- Tickets table policies
ALTER TABLE tickets FORCE ROW LEVEL SECURITY;

-- Allow customers to view their own tickets
CREATE POLICY "Customers can view their own tickets"
  ON tickets FOR SELECT
  USING (customer_id = auth.uid());

-- Allow staff to view all tickets
CREATE POLICY "Staff can view all tickets"
  ON tickets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.clade IN ('ADMIN', 'MANAGER', 'AGENT')
    )
  );

-- Allow staff to manage tickets
CREATE POLICY "Staff can manage tickets"
  ON tickets 
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.clade IN ('ADMIN', 'MANAGER', 'AGENT')
    )
  );

-- Messages table policies
ALTER TABLE messages FORCE ROW LEVEL SECURITY;

-- Allow users to view their ticket messages
CREATE POLICY "Users can view their ticket messages"
  ON messages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM tickets t
    WHERE t.id = ticket_id
    AND (t.customer_id = auth.uid() OR t.assigned_to_id = auth.uid() OR t.created_by_id = auth.uid())
  ));

-- Allow staff to view all messages
CREATE POLICY "Staff can view all messages"
  ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.clade IN ('ADMIN', 'MANAGER', 'AGENT')
    )
  );

-- Allow staff to manage messages
CREATE POLICY "Staff can manage messages"
  ON messages 
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.clade IN ('ADMIN', 'MANAGER', 'AGENT')
    )
  );

-- Audit logs table policies
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

-- Allow staff to view audit logs
CREATE POLICY "Staff can view audit logs"
  ON audit_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.clade IN ('ADMIN', 'MANAGER', 'AGENT')
    )
  );

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
