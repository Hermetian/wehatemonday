import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateTestTicketData, TestTicketConfig } from '@/app/lib/utils/test-ticket-generator';
import { createAuditLog } from '@/app/lib/utils/audit-logger';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: Request) {
  try {
    const config: TestTicketConfig = await request.json();
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Generate test ticket data
    const testTickets = await generateTestTicketData(supabase, config);

    // Create tickets in Supabase
    const { data: createdTickets, error } = await supabase
      .from('tickets')
      .insert(testTickets)
      .select();

    if (error) {
      throw error;
    }

    // Create audit logs for each ticket
    await Promise.all(
      createdTickets.map(ticket =>
        createAuditLog({
          supabase,
          action: 'CREATE',
          entity: 'TICKET',
          entityId: ticket.id,
          userId: ticket.created_by,
          oldData: null,
          newData: { ...ticket, type: 'TEST_TICKET' },
        })
      )
    );

    return NextResponse.json({
      success: true,
      count: createdTickets.length,
      tickets: createdTickets,
      batchId: createdTickets[0].test_batch_id
    });
  } catch (error) {
    console.error('Failed to create test tickets:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create test tickets' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { batchId } = await request.json();
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find test tickets to delete
    const { data: ticketsToDelete, error: findError } = await supabase
      .from('tickets')
      .select('id')
      .eq('test_batch_id', batchId);

    if (findError) {
      throw findError;
    }

    if (ticketsToDelete.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
      });
    }

    const ticketIds = ticketsToDelete.map(ticket => ticket.id);

    // Delete related messages first
    const { error: messagesError } = await supabase
      .from('messages')
      .delete()
      .in('ticket_id', ticketIds);

    if (messagesError) {
      throw messagesError;
    }

    // Delete audit logs
    const { error: auditLogsError } = await supabase
      .from('audit_logs')
      .delete()
      .in('entity_id', ticketIds);

    if (auditLogsError) {
      throw auditLogsError;
    }

    // Delete the tickets
    const { error: deleteError } = await supabase
      .from('tickets')
      .delete()
      .in('id', ticketIds);

    if (deleteError) {
      throw deleteError;
    }

    return NextResponse.json({
      success: true,
      count: ticketIds.length,
    });
  } catch (error) {
    console.error('Failed to delete test tickets:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete test tickets' },
      { status: 500 }
    );
  }
}