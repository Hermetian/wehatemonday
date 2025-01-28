import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

// Client for public operations
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    storageKey: 'sb-auth-token',
    storage: {
      getItem: (key) => {
        if (typeof window === 'undefined') return null
        return window.localStorage.getItem(key)
      },
      setItem: (key, value) => {
        if (typeof window === 'undefined') return
        window.localStorage.setItem(key, value)
        // Also set cookie for server-side access
        document.cookie = `${key}=${value}; path=/; max-age=3600; SameSite=Lax`
      },
      removeItem: (key) => {
        if (typeof window === 'undefined') return
        window.localStorage.removeItem(key)
        // Also remove cookie
        document.cookie = `${key}=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT`
      },
    },
  },
  global: {
    headers: {
      'Content-Type': 'application/json',
    },
  },
})

// Client for admin operations (now using anon key)
export const supabaseAdmin = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

// Log configuration status (but not the actual keys)
if (process.env.NODE_ENV !== 'production') {
  console.log('Supabase Configuration Status:', {
    url: !!supabaseUrl,
    anonKey: !!supabaseAnonKey,
    env: process.env.NODE_ENV
  })
} 