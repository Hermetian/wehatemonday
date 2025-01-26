import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { email, clade, action } = body;
    if (!email || !action) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return request.headers.get('cookie')?.split('; ').find(c => c.startsWith(`${name}=`))?.split('=')[1];
          },
          set() { return; }, // Handled by middleware
          remove() { return; }, // Handled by middleware
        },
      }
    );

    // Verify the auth token
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'No authorization header' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user: supabaseUser }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !supabaseUser) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    if (action === 'signup') {
      // Update user metadata with clade
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        supabaseUser.id,
        { app_metadata: { clade } }
      );

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      // Also update the users table to maintain both places
      const { error: userUpdateError } = await supabase
        .from('users')
        .upsert({ 
          id: supabaseUser.id,
          email: email,
          clade: clade
        });

      if (userUpdateError) {
        return NextResponse.json({ error: userUpdateError.message }, { status: 500 });
      }

      return NextResponse.json({ user: supabaseUser, clade });
    }

    if (action === 'signin') {
      // Get clade from user metadata
      const { data: { user }, error: getUserError } = await supabase.auth.admin.getUserById(supabaseUser.id);
      
      if (getUserError || !user) {
        return NextResponse.json({ error: 'Failed to get user data' }, { status: 500 });
      }

      const userClade = user.app_metadata?.clade;
      if (!userClade) {
        return NextResponse.json({ error: 'User clade not found' }, { status: 404 });
      }

      return NextResponse.json({ user: supabaseUser, clade: userClade });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Auth error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Authentication failed';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}