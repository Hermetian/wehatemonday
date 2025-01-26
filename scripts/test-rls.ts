import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Validate environment variables
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required');
if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is required');
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
if (!process.env.SUPABASE_DB_URL) throw new Error('SUPABASE_DB_URL is required');

console.log('Environment variables loaded successfully');

// Create PostgreSQL client for direct database access
const pgClient = new Client({
  connectionString: process.env.SUPABASE_DB_URL,
});

async function setupUsers() {
  console.log('Setting up users...');
  
  try {
    await pgClient.connect();
    
    // Read and execute the SQL setup script
    const setupSql = fs.readFileSync(path.resolve(__dirname, 'setup-users.sql'), 'utf8');
    await pgClient.query(setupSql);
    
    // Check both storage locations
    const { rows } = await pgClient.query(`
      SELECT 
        u.id, 
        u.email, 
        u.clade as users_clade,
        au.raw_app_meta_data->>'clade' as auth_clade
      FROM users u
      JOIN auth.users au ON u.id = au.id
    `);
    console.log('\nUsers in database:');
    console.log(rows);
    
    console.log('Users set up successfully');
  } catch (error) {
    console.error('Failed to set up users:', error);
    throw error;
  } finally {
    await pgClient.end();
  }
}

async function signInAndTest(email: string, clade: string, testFn: (client: any, userId: string) => Promise<void>) {
  console.log(`\nTesting ${clade} Clade...`);
  console.log(`Signing in as ${email}`);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: { session }, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password: 'password123',
  });

  if (signInError || !session) {
    console.error('Failed to sign in:', signInError);
    return;
  }

  console.log('Signed in successfully');

  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      },
    }
  );

  try {
    await testFn(client, session.user.id);
  } catch (error) {
    console.error('Failed to execute test:', error);
  }
}

async function testUserAccess(client: any, userId: string) {
  // Try to get own user data
  const { data: userData, error: userError } = await client
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (userError) {
    console.error('Failed to get user data:', userError);
  } else {
    console.log('Successfully retrieved user data:', userData);
  }
}

async function main() {
  await setupUsers();

  await signInAndTest('customer@example.com', 'CUSTOMER', testUserAccess);
  await signInAndTest('agent@example.com', 'AGENT', testUserAccess);
  await signInAndTest('manager@example.com', 'MANAGER', testUserAccess);
  await signInAndTest('admin@example.com', 'ADMIN', testUserAccess);
}

main();
