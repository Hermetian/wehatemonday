-- First, ensure all users have their clade in auth metadata
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT id, clade FROM auth.users JOIN public.users ON auth.users.id = public.users.id
    LOOP
        UPDATE auth.users 
        SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object('clade', r.clade::text)
        WHERE id = r.id;
    END LOOP;
END $$;

-- Update RLS policies to use auth metadata instead of users table
CREATE OR REPLACE FUNCTION get_user_clade() RETURNS user_clade AS $$
BEGIN
    RETURN (auth.jwt() ->> 'app_metadata')::jsonb ->> 'clade';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Remove clade from users table
ALTER TABLE users DROP COLUMN clade;
