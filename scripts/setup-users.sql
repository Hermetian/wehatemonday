-- First, ensure the user_clade type exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_clade') THEN
    CREATE TYPE user_clade AS ENUM ('ADMIN', 'MANAGER', 'AGENT', 'CUSTOMER');
  END IF;
END $$;

-- Update auth.users to only use app_metadata.clade and not role
UPDATE auth.users SET 
  raw_app_meta_data = jsonb_build_object('clade', u.clade, 'provider', 'email', 'providers', ARRAY['email']::text[]),
  raw_user_meta_data = jsonb_build_object('email_verified', true),
  role = 'authenticated'  -- Set everyone to just 'authenticated' role
FROM (VALUES 
  ('sevendeadkings@gmail.com', 'ADMIN'),
  ('loredonewrite@gmail.com', 'CUSTOMER'),
  ('cordwell@gmail.com', 'ADMIN'),
  ('customer@example.com', 'CUSTOMER'),
  ('agent@example.com', 'AGENT'),
  ('manager@example.com', 'MANAGER'),
  ('admin@example.com', 'ADMIN')
) as u(email, clade)
WHERE auth.users.email = u.email;

-- Disable RLS temporarily
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- Insert or update users in public.users table
INSERT INTO public.users (id, email, clade)
SELECT 
  u.id,
  u.email,
  (u.raw_app_meta_data->>'clade')::user_clade as clade
FROM auth.users u
WHERE u.email IN (
  'sevendeadkings@gmail.com',
  'loredonewrite@gmail.com',
  'cordwell@gmail.com',
  'customer@example.com',
  'agent@example.com',
  'manager@example.com',
  'admin@example.com'
)
ON CONFLICT (id) DO UPDATE
SET 
  email = EXCLUDED.email,
  clade = EXCLUDED.clade,
  updated_at = CURRENT_TIMESTAMP;

-- Update users table to match
UPDATE users SET 
  clade = u.clade::user_clade
FROM (VALUES 
  ('sevendeadkings@gmail.com', 'ADMIN'),
  ('loredonewrite@gmail.com', 'CUSTOMER'),
  ('cordwell@gmail.com', 'ADMIN'),
  ('customer@example.com', 'CUSTOMER'),
  ('agent@example.com', 'AGENT'),
  ('manager@example.com', 'MANAGER'),
  ('admin@example.com', 'ADMIN')
) as u(email, clade)
WHERE users.email = u.email;

-- Re-enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Verify the setup
SELECT 
  u.id,
  u.email,
  u.clade as users_clade,
  au.raw_app_meta_data->>'clade' as auth_clade
FROM public.users u
JOIN auth.users au ON u.id = au.id
ORDER BY u.email;
