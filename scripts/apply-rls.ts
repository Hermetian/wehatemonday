import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const targetClient = new Client({
  connectionString: process.env.SUPABASE_DB_URL,
});

async function main() {
  try {
    console.log('Connecting to database...');
    await targetClient.connect();
    
    // First drop existing policies
    console.log('Dropping existing policies...');
    const dropSql = fs.readFileSync(path.resolve(__dirname, '../supabase/migrations/0001_drop_policies.sql'), 'utf8');
    await targetClient.query(dropSql);
    
    // Then apply RLS policies
    console.log('Applying RLS policies...');
    const policiesSql = fs.readFileSync(path.resolve(__dirname, '../supabase/migrations/0002_rls_policies.sql'), 'utf8');
    await targetClient.query(policiesSql);
    
    // Finally enable RLS
    console.log('Enabling RLS...');
    const rlsSql = fs.readFileSync(path.resolve(__dirname, '../supabase/migrations/0004_enable_rls.sql'), 'utf8');
    await targetClient.query(rlsSql);
    
    console.log('RLS enabled successfully!');
  } catch (error) {
    console.error('Failed to enable RLS:', error);
    process.exit(1);
  } finally {
    await targetClient.end();
  }
}

main();
