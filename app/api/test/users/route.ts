import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateTestUserData, TestUserConfig } from '@/app/lib/utils/test-data-generator';
import { createAuditLog } from '@/app/lib/utils/audit-logger';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: Request) {
  try {
    const config: TestUserConfig = await request.json();
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Generate test user data
    const testUsers = generateTestUserData(config);

    // Create users in Supabase
    const { data: createdUsers, error } = await supabase
      .from('users')
      .insert(testUsers)
      .select();

    if (error) {
      throw error;
    }

    // Create audit logs for each user
    await Promise.all(
      createdUsers.map(user =>
        createAuditLog({
          supabase,
          action: 'CREATE',
          entity: 'USER',
          entityId: user.id,
          userId: user.id,
          oldData: null,
          newData: { ...user, type: 'TEST_USER' },
        })
      )
    );

    return NextResponse.json({
      success: true,
      count: createdUsers.length,
      users: createdUsers,
      batchId: testUsers[0].testBatchId
    });
  } catch (error) {
    console.error('Failed to create test users:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create test users' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find test users to delete
    const { batchId } = await request.json();

    const { data: usersToDelete, error: findError } = await supabase
      .from('users')
      .select('id')
      .eq('test_batch_id', batchId);

    if (findError) {
      throw findError;
    }

    if (usersToDelete.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
      });
    }

    const userIds = usersToDelete.map(user => user.id);

    // Delete related data first
    const { error: ticketsError } = await supabase
      .from('tickets')
      .delete()
      .in('customer_id', userIds);

    if (ticketsError) {
      throw ticketsError;
    }

    const { error: messagesError } = await supabase
      .from('messages')
      .delete()
      .in('user_id', userIds);

    if (messagesError) {
      throw messagesError;
    }

    const { error: teamError } = await supabase
      .from('team_members')
      .delete()
      .in('user_id', userIds);

    if (teamError) {
      throw teamError;
    }

    // Finally delete the users
    const { error: deleteError } = await supabase
      .from('users')
      .delete()
      .in('id', userIds);

    if (deleteError) {
      throw deleteError;
    }

    return NextResponse.json({
      success: true,
      count: userIds.length,
    });
  } catch (error) {
    console.error('Failed to delete test users:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete test users' },
      { status: 500 }
    );
  }
}