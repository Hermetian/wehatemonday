import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  console.log('Middleware: Processing request to', request.url);
  
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          const cookie = request.cookies.get(name)?.value
          console.log(`Middleware: Getting cookie ${name}:`, cookie ? 'present' : 'missing')
          return cookie
        },
        set(name: string, value: string, options: CookieOptions) {
          console.log(`Middleware: Setting cookie ${name}`)
          // Ensure cookies are set with proper security options
          response.cookies.set({
            name,
            value,
            ...options,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 60 * 60 * 24 * 7 // 7 days
          })
        },
        remove(name: string, options: CookieOptions) {
          console.log(`Middleware: Removing cookie ${name}`)
          response.cookies.set({
            name,
            value: '',
            ...options,
            httpOnly: true,
            expires: new Date(0),
            path: '/'
          })
        },
      },
    }
  )

  // Get the session and refresh if needed
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  
  if (sessionError) {
    console.error('Middleware: Session error:', sessionError)
  }

  // Log session details
  console.log('Middleware: Session check result:', {
    hasSession: !!session,
    userEmail: session?.user?.email,
    error: sessionError?.message
  })

  const isAuthPage = request.nextUrl.pathname.startsWith('/auth/')
  const isApiRequest = request.nextUrl.pathname.startsWith('/api/')
  const isSignInPage = request.nextUrl.pathname === '/auth/signin'
  const hasAuthInProgress = request.cookies.get('auth-in-progress')?.value === 'true'

  console.log('Middleware: Auth state:', {
    isAuthPage,
    isApiRequest,
    isSignInPage,
    hasAuthInProgress,
    hasSession: !!session
  })

  // Set auth-in-progress cookie when hitting the sign-in page
  if (isSignInPage && !hasAuthInProgress) {
    console.log('Middleware: Setting auth-in-progress cookie')
    response.cookies.set({
      name: 'auth-in-progress',
      value: 'true',
      path: '/',
      maxAge: 300, // 5 minutes
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    })
  }

  // If we have a session and we're on the auth page, redirect to the intended destination
  if (session && isAuthPage) {
    const redirectTo = request.nextUrl.searchParams.get('redirect') || '/homepage'
    console.log('Middleware: Redirecting from auth page to:', redirectTo)
    return NextResponse.redirect(new URL(redirectTo, request.url))
  }

  // If no session and not on auth page, redirect to sign in
  if (!session && !isAuthPage && !isApiRequest && !hasAuthInProgress) {
    const redirectUrl = new URL('/auth/signin', request.url)
    redirectUrl.searchParams.set('redirect', request.nextUrl.pathname)
    console.log('Middleware: Redirecting to sign in, no session')
    return NextResponse.redirect(redirectUrl)
  }

  // If session exists, set both the Authorization header and the auth token cookie
  if (session?.access_token) {
    response.headers.set('Authorization', `Bearer ${session.access_token}`)
    response.cookies.set({
      name: 'sb-auth-token',
      value: session.access_token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7 // 7 days
    })
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
}