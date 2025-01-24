import { NextResponse } from 'next/server';
import prisma from '@/app/prisma';
import { cleanupExpiredTestData } from '@/app/lib/utils/test-data-cleanup';

export async function POST() {
  try {
    const result = await cleanupExpiredTestData(prisma);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Cleanup endpoint error:', error);
    return NextResponse.json(
      { error: 'Failed to cleanup test data' },
      { status: 500 }
    );
  }
} 