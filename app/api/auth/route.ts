import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';
import prisma from '@/app/prisma';
import { createAuditLog } from '@/app/lib/utils/audit-logger';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { email, role, action } = body;
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

    // Verify database connection before proceeding
    try {
      await prisma.$connect();
    } catch (dbError) {
      console.error('Database connection error:', dbError);
      return NextResponse.json({ error: 'Database connection failed' }, { status: 503 });
    }

    if (action === 'signup') {
      // Get existing user data for audit log
      const existingUserData = await prisma.user.findUnique({
        where: { id: supabaseUser.id },
      });

      if (existingUserData) {
        // Update existing user's role
        await prisma.user.update({
          where: { id: supabaseUser.id },
          data: { 
            role: role as UserRole,
            updatedAt: new Date()
          }
        });

        // Create audit log for role update
        await createAuditLog({
          action: 'UPDATE',
          entity: 'USER',
          entityId: supabaseUser.id,
          userId: supabaseUser.id,
          oldData: existingUserData,
          newData: { ...existingUserData, role },
          prisma,
        });

        return NextResponse.json({ user: supabaseUser, role });
      }

      // Create new user in database
      const newUser = await prisma.user.create({
        data: {
          id: supabaseUser.id,
          email,
          role: role as UserRole,
        }
      });

      // Create audit log for new user
      await createAuditLog({
        action: 'CREATE',
        entity: 'USER',
        entityId: supabaseUser.id,
        userId: supabaseUser.id,
        oldData: null,
        newData: newUser,
        prisma,
      });

      return NextResponse.json({ user: supabaseUser, role });
    }

    if (action === 'signin') {
      const dbUser = await prisma.user.findUnique({
        where: { id: supabaseUser.id },
        select: { role: true }
      });

      if (!dbUser) {
        return NextResponse.json({ error: 'User not found in database' }, { status: 404 });
      }

      return NextResponse.json({ user: supabaseUser, role: dbUser.role });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Auth error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Authentication failed';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
} 