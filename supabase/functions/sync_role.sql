-- Drop existing function if it exists
DROP FUNCTION IF EXISTS sync_role_to_auth CASCADE;
DROP FUNCTION IF EXISTS public.sync_role CASCADE;

-- Create function to sync role between database and auth
CREATE OR REPLACE FUNCTION public.sync_role()
RETURNS TRIGGER AS $$
DECLARE
  old_role text;
  new_role text;
BEGIN
  -- Get old and new roles for audit
  old_role := OLD.role;
  new_role := NEW.role;

  -- Update auth.users metadata
  UPDATE auth.users 
  SET raw_app_meta_data = 
    COALESCE(raw_app_meta_data, '{}'::jsonb) || 
    jsonb_build_object('user_role', NEW.role)
  WHERE id = NEW.id;

  -- Create audit log
  INSERT INTO audit_logs (
    action,
    entity,
    entity_id,
    user_id,
    old_data,
    new_data,
    created_at
  ) VALUES (
    'UPDATE',
    'USER',
    NEW.id,
    NEW.id,
    jsonb_build_object('role', old_role),
    jsonb_build_object('role', new_role),
    NOW()
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for role changes
DROP TRIGGER IF EXISTS sync_role_trigger ON users;
CREATE TRIGGER sync_role_trigger
  AFTER UPDATE OF role ON users
  FOR EACH ROW
  WHEN (OLD.role IS DISTINCT FROM NEW.role)
  EXECUTE FUNCTION public.sync_role();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.sync_role TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_role TO service_role; 