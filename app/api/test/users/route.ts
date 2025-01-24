import { NextResponse } from 'next/server';
import prisma from '@/app/prisma';
import { generateTestUserData, TestUserConfig } from '@/app/lib/utils/test-data-generator';
import { createAuditLog } from '@/app/lib/utils/audit-logger';
import { Prisma } from '@prisma/client';

export async function POST(request: Request) {
  try {
    const config: TestUserConfig = await request.json();
    const testUsers = generateTestUserData(config);
    
    const createdUsers = await prisma.$transaction(
      testUsers.map(userData => 
        prisma.user.create({
          data: userData as Prisma.UserCreateInput
        })
      )
    );

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
          prisma,
        })
      )
    );

    return NextResponse.json({ 
      success: true, 
      users: createdUsers,
      batchId: testUsers[0].testBatchId 
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
    const usersToDelete = await prisma.user.findMany({
      where: {
        testBatchId: batchId
      } as Prisma.UserWhereInput
    });

    // Delete all related data in a transaction
    await prisma.$transaction(async (tx) => {
      // Delete audit logs
      await tx.auditLog.deleteMany({
        where: {
          userId: {
            in: usersToDelete.map(u => u.id)
          }
        }
      });

      // Delete messages
      await tx.message.deleteMany({
        where: {
          ticket: {
            OR: [
              { createdById: { in: usersToDelete.map(u => u.id) } },
              { assignedToId: { in: usersToDelete.map(u => u.id) } }
            ]
          }
        }
      });

      // Delete tickets
      await tx.ticket.deleteMany({
        where: {
          OR: [
            { createdById: { in: usersToDelete.map(u => u.id) } },
            { assignedToId: { in: usersToDelete.map(u => u.id) } }
          ]
        }
      });

      // Delete users
      await tx.user.deleteMany({
        where: {
          testBatchId: batchId
        } as Prisma.UserWhereInput
      });
    });

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