import { NextResponse } from 'next/server';
import { generateTestUserData, TestUserConfig } from '@/app/lib/utils/test-data-generator';
import { createAuditLog } from '@/app/lib/utils/audit-logger';
import { supabaseAdmin } from '@/app/lib/auth/supabase';

export async function POST(request: Request) {
  try {
    const config: TestUserConfig = await request.json();
    const testUsers = generateTestUserData(config);
    
    // Create users
    const { data: createdUsers, error: createError } = await supabaseAdmin
      .from('users')
      .insert(testUsers)
      .select();

    if (createError) throw createError;
    if (!createdUsers?.length) throw new Error('No users created');

    // Create audit logs for test users
    await Promise.all(
      createdUsers.map(user =>
        createAuditLog({
          action: 'CREATE',
          entity: 'USER',
          entityId: user.id,
          userId: user.id,
          oldData: null,
          newData: { ...user, type: 'TEST_USER' },
          supabase: supabaseAdmin
        })
      )
    );

    return NextResponse.json({ 
      success: true, 
      users: createdUsers,
      batchId: testUsers[0].test_batch_id 
    });
  } catch (error) {
    console.error('Test user creation error:', error);
    return NextResponse.json(
      { error: 'Failed to create test users' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { batchId } = await request.json();

    // Find all users in the batch
    const { data: usersToDelete, error: findError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('test_batch_id', batchId);

    if (findError) throw findError;
    if (!usersToDelete?.length) {
      return NextResponse.json({ 
        success: true,
        deletedCount: 0
      });
    }

    const userIds = usersToDelete.map(u => u.id);

    // Find all tickets associated with these users
    const { data: userTickets, error: ticketQueryError } = await supabaseAdmin
      .from('tickets')
      .select('id')
      .or(`created_by_id.in.(${userIds}),assigned_to_id.in.(${userIds})`);

    if (ticketQueryError) throw ticketQueryError;

    // Delete related data in order due to foreign key constraints
    if (userTickets?.length) {
      const ticketIds = userTickets.map(t => t.id);

      // Delete audit logs for tickets
      const { error: ticketAuditError } = await supabaseAdmin
        .from('audit_logs')
        .delete()
        .eq('entity', 'TICKET')
        .in('entity_id', ticketIds);
      
      if (ticketAuditError) throw ticketAuditError;

      // Delete tickets (messages will be deleted by cascade)
      const { error: ticketError } = await supabaseAdmin
        .from('tickets')
        .delete()
        .or(`created_by_id.in.(${userIds}),assigned_to_id.in.(${userIds})`);

      if (ticketError) throw ticketError;
    }

    // Delete team memberships
    const { error: teamMemberError } = await supabaseAdmin
      .from('team_members')
      .delete()
      .in('user_id', userIds);

    if (teamMemberError) throw teamMemberError;

    // Delete audit logs for users
    const { error: userAuditError } = await supabaseAdmin
      .from('audit_logs')
      .delete()
      .in('user_id', userIds);

    if (userAuditError) throw userAuditError;

    // Finally delete users
    const { error: userError } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('test_batch_id', batchId);

    if (userError) throw userError;

    return NextResponse.json({ 
      success: true,
      deletedCount: usersToDelete.length
    });
  } catch (error) {
    console.error('Test user deletion error:', error);
    return NextResponse.json(
      { error: 'Failed to delete test users' },
      { status: 500 }
    );
  }
} 