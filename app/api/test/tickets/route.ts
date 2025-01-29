import { NextResponse } from 'next/server';
import { generateTestTicketData, TestTicketConfig } from '@/app/lib/utils/test-ticket-generator';
import { createAuditLog } from '@/app/lib/utils/audit-logger';
import { supabaseAdmin } from '@/app/lib/auth/supabase';

export async function POST(request: Request) {
  try {
    const config: TestTicketConfig = await request.json();
    const testTickets = await generateTestTicketData(config);
    
    // Create tickets and fetch related user data
    const createdTickets = [];
    for (const ticketData of testTickets) {
      const { data: ticket, error: ticketError } = await supabaseAdmin
        .from('tickets')
        .insert(ticketData)
        .select(`
          *,
          created_by:created_by_id(id, name, email),
          assigned_to:assigned_to_id(id, name, email)
        `)
        .single();

      if (ticketError) throw ticketError;
      createdTickets.push(ticket);
    }

    // Create audit logs for test tickets
    await Promise.all(
      createdTickets.map(ticket =>
        createAuditLog({
          action: 'CREATE',
          entity: 'TICKET',
          entityId: ticket.id,
          userId: ticket.created_by_id,
          oldData: null,
          newData: { ...ticket, type: 'TEST_TICKET' },
          supabase: supabaseAdmin
        })
      )
    );

    return NextResponse.json({ 
      success: true, 
      tickets: createdTickets,
      batchId: createdTickets[0].test_batch_id 
    });
  } catch (error) {
    console.error('Test ticket creation error:', error);
    return NextResponse.json(
      { error: 'Failed to create test tickets' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { batchId } = await request.json();

    // Find all tickets in the batch
    const { data: ticketsToDelete, error: findError } = await supabaseAdmin
      .from('tickets')
      .select('id')
      .eq('test_batch_id', batchId);

    if (findError) throw findError;
    if (!ticketsToDelete?.length) {
      return NextResponse.json({ 
        success: true,
        deletedCount: 0
      });
    }

    const ticketIds = ticketsToDelete.map(t => t.id);

    // Delete related data in order (messages will be deleted by cascade)
    const { error: auditError } = await supabaseAdmin
      .from('audit_logs')
      .delete()
      .eq('entity', 'TICKET')
      .in('entity_id', ticketIds);
    
    if (auditError) throw auditError;

    // Delete tickets (messages will be deleted by cascade)
    const { error: ticketError } = await supabaseAdmin
      .from('tickets')
      .delete()
      .eq('test_batch_id', batchId);

    if (ticketError) throw ticketError;

    return NextResponse.json({ 
      success: true,
      deletedCount: ticketsToDelete.length
    });
  } catch (error) {
    console.error('Test ticket deletion error:', error);
    return NextResponse.json(
      { error: 'Failed to delete test tickets' },
      { status: 500 }
    );
  }
} 