import { createBrowserClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

// Extract project ref from URL for logging
const projectRef = supabaseUrl.match(/(?:\/\/|\.)(.*?)(?:\.supabase\.|$)/)?.[1]
console.log('Supabase project ref:', projectRef)

// Client for public operations using SSR-compatible client
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Admin client (only used server-side) with service role key
export const createAdminClient = () => {
  if (typeof window !== 'undefined') {
    throw new Error('Admin client cannot be used on the client side')
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for admin operations')
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )
}

// Log configuration status (but not the actual keys)
if (process.env.NODE_ENV !== 'production') {
  console.log('Supabase Configuration Status:', {
    url: !!supabaseUrl,
    anonKey: !!supabaseAnonKey,
    env: process.env.NODE_ENV,
    projectRef
  })
} 