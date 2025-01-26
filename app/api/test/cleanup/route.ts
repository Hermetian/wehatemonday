import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cleanupExpiredTestData } from '@/lib/utils/test-data-cleanup';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST() {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const result = await cleanupExpiredTestData(supabase);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Failed to cleanup test data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to cleanup test data' },
      { status: 500 }
    );
  }
}