import { NextResponse } from 'next/server';
import prisma from '@/app/prisma';
import { generateTestTicketData, TestTicketConfig } from '@/app/lib/utils/test-ticket-generator';
import { createAuditLog } from '@/app/lib/utils/audit-logger';
import { Prisma } from '@prisma/client';

export async function POST(request: Request) {
  try {
    const config: TestTicketConfig = await request.json();
    const testTickets = await generateTestTicketData(prisma, config);
    
    const createdTickets = await prisma.$transaction(
      testTickets.map(ticketData => {
        const { metadata, testBatchId, ...rest } = ticketData;
        return prisma.ticket.create({
          data: {
            ...rest,
            metadata: metadata as Prisma.InputJsonValue,
            testBatchId
          },
          include: {
            createdBy: {
              select: { id: true, name: true, email: true }
            },
            assignedTo: {
              select: { id: true, name: true, email: true }
            }
          }
        });
      })
    );

    // Create audit logs for test tickets
    await Promise.all(
      createdTickets.map(ticket =>
        createAuditLog({
          action: 'CREATE',
          entity: 'TICKET',
          entityId: ticket.id,
          userId: ticket.createdById,
          oldData: null,
          newData: { ...ticket, type: 'TEST_TICKET' },
          prisma,
        })
      )
    );

    return NextResponse.json({ 
      success: true, 
      tickets: createdTickets,
      batchId: createdTickets[0].testBatchId 
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
    const ticketsToDelete = await prisma.ticket.findMany({
      where: {
        testBatchId: batchId
      }
    });

    // Delete all related data in a transaction
    await prisma.$transaction(async (tx) => {
      // Delete messages
      await tx.message.deleteMany({
        where: {
          ticketId: {
            in: ticketsToDelete.map(t => t.id)
          }
        }
      });

      // Delete audit logs
      await tx.auditLog.deleteMany({
        where: {
          entity: 'TICKET',
          entityId: {
            in: ticketsToDelete.map(t => t.id)
          }
        }
      });

      // Delete tickets
      await tx.ticket.deleteMany({
        where: {
          testBatchId: batchId
        }
      });
    });

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