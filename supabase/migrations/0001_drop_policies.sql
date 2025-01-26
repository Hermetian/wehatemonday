-- Drop all policies from all tables
DROP POLICY IF EXISTS "Users can view their own profile" ON users;
DROP POLICY IF EXISTS "Users can update their own profile" ON users;
DROP POLICY IF EXISTS "Admins can manage all users" ON users;

DROP POLICY IF EXISTS "Team members can view their teams" ON teams;
DROP POLICY IF EXISTS "Staff can view all teams" ON teams;
DROP POLICY IF EXISTS "Managers and admins can manage teams" ON teams;

DROP POLICY IF EXISTS "Team members can view their team members" ON team_members;
DROP POLICY IF EXISTS "Staff can view all team members" ON team_members;
DROP POLICY IF EXISTS "Managers and admins can manage team members" ON team_members;

DROP POLICY IF EXISTS "Customers can view their own tickets" ON tickets;
DROP POLICY IF EXISTS "Staff can view all tickets" ON tickets;
DROP POLICY IF EXISTS "Staff can manage tickets" ON tickets;

DROP POLICY IF EXISTS "Users can view their ticket messages" ON messages;
DROP POLICY IF EXISTS "Staff can view all messages" ON messages;
DROP POLICY IF EXISTS "Staff can manage messages" ON messages;

DROP POLICY IF EXISTS "Staff can view audit logs" ON audit_logs;
