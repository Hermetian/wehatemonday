import { NextResponse } from 'next/server';
import { Client } from 'langsmith';

const langsmith = new Client({
  apiUrl: process.env.LANGSMITH_API_URL,
  apiKey: process.env.LANGSMITH_API_KEY,
});

export async function POST(request: Request) {
  try {
    const { runId, feedbackType, feedback } = await request.json();

    await langsmith.createFeedback(
      runId,
      feedbackType,
      feedback
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error creating feedback:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 