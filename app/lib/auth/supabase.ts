import { createBrowserClient } from '@supabase/ssr'

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

// Admin client (only used server-side)
export const supabaseAdmin = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Log configuration status (but not the actual keys)
if (process.env.NODE_ENV !== 'production') {
  console.log('Supabase Configuration Status:', {
    url: !!supabaseUrl,
    anonKey: !!supabaseAnonKey,
    env: process.env.NODE_ENV,
    projectRef
  })
} 