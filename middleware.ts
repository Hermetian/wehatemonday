import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  console.log('Middleware: Processing request to', request.url);

  // Early return for public routes, auth callback, and static assets
  const isPublicAccess = request.nextUrl.pathname === '/' || 
                        request.nextUrl.pathname.startsWith('/_next') ||
                        request.nextUrl.pathname.startsWith('/public') ||
                        request.nextUrl.pathname === '/favicon.ico'

  const isAuthCallback = request.nextUrl.searchParams.has('code') || 
                        request.nextUrl.searchParams.has('error') ||
                        request.nextUrl.pathname === '/auth/callback'

  const isAuthPage = request.nextUrl.pathname.startsWith('/auth/')
  const isApiRequest = request.nextUrl.pathname.startsWith('/api/')
  
  // Don't process auth checks for these routes
  if (isPublicAccess || isAuthCallback || isApiRequest) {
    console.log('Middleware: Skipping auth check for exempt route');
    return NextResponse.next()
  }
  
  let response = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          // Let Supabase handle cookie names and options
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({
            name,
            value: '',
            ...options,
            expires: new Date(0),
          })
        },
      },
    }
  )

  try {
    // Get the session and refresh if needed
    console.log('Middleware: Cookie header:', request.headers.get('cookie'));
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    console.log('Middleware: Session state:', {
      hasSession: !!session,
      hasError: !!sessionError,
      userId: session?.user?.id,
      userEmail: session?.user?.email,
      cookieNames: request.cookies.getAll().map(c => c.name)
    });
    
    if (sessionError) {
      console.error('Middleware: Session error:', sessionError);
      throw sessionError
    }

    // If we have a session and we're on the auth page, redirect to homepage
    if (session && isAuthPage) {
      const url = new URL(request.url)
      // Don't redirect if we just signed out
      const justSignedOut = url.searchParams.get('signedOut') === 'true'
      if (!justSignedOut) {
        console.log('Middleware: Authenticated user on auth page, redirecting to homepage')
        return NextResponse.redirect(new URL('/homepage', request.url))
      }
    }

    // If we don't have a session and we're not on the auth page, redirect to signin
    if (!session && !isAuthPage) {
      console.log('Middleware: Unauthenticated user on protected route, redirecting to signin')
      return NextResponse.redirect(new URL('/auth/signin', request.url))
    }

    // If we have a session, set the Authorization header
    if (session?.access_token) {
      const requestHeaders = new Headers(request.headers)
      requestHeaders.set('Authorization', `Bearer ${session.access_token}`)
      response = NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      })
    }

    return response
  } catch (error) {
    console.error('Middleware: Auth error:', error)
    // On any auth error, redirect to signin
    return NextResponse.redirect(new URL('/auth/signin', request.url))
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}