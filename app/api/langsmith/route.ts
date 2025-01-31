import { createAdminClient } from '@/app/lib/auth/supabase';
import { NextResponse } from 'next/server';

const adminClient = createAdminClient(true);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const id = searchParams.get('id');
  const ticketId = searchParams.get('ticketId');

  try {
    switch (action) {
      case 'getConversation':
        if (!id) {
          return NextResponse.json({ error: 'Missing id' }, { status: 400 });
        }
        const { data: conversation, error: convError } = await adminClient
          .from('marketplace_conversations')
          .select('raw_content')
          .eq('id', id)
          .single();

        if (convError) {
          return NextResponse.json({ error: convError.message }, { status: 500 });
        }
        return NextResponse.json(conversation);

      case 'similarTickets':
        if (!ticketId) {
          return NextResponse.json({ error: 'Missing ticketId' }, { status: 400 });
        }
        const { data: tickets } = await adminClient
          .from('tickets')
          .select('title, description, tags, status, priority')
          .neq('id', ticketId)
          .overlaps('tags', searchParams.get('tags')?.split(',') || [])
          .order('created_at', { ascending: false })
          .limit(3);
        return NextResponse.json({ tickets });

      case 'similarMessages':
        if (!ticketId) {
          return NextResponse.json({ error: 'Missing ticketId' }, { status: 400 });
        }
        const { data: similarTickets } = await adminClient
          .from('tickets')
          .select('id')
          .overlaps('tags', searchParams.get('tags')?.split(',') || [])
          .neq('id', ticketId)
          .limit(10);

        if (!similarTickets?.length) {
          return NextResponse.json({ messages: [] });
        }

        const { data: messages } = await adminClient
          .from('messages')
          .select('content, is_internal, ticket_id')
          .in('ticket_id', similarTickets.map(t => t.id))
          .order('created_at', { ascending: false })
          .limit(5);
        return NextResponse.json({ messages });

      case 'sellerMessages':
        const { data: sellerMessages } = await adminClient
          .from('messages')
          .select('content, is_internal, ticket_id')
          .eq('is_internal', false)
          .order('created_at', { ascending: false })
          .limit(10);
        return NextResponse.json({ messages: sellerMessages });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error in langsmith API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  try {
    if (action === 'updateConversation') {
      const body = await request.json();
      const { data, error } = await adminClient
        .from('marketplace_conversations')
        .update(body)
        .eq('id', id)
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error in langsmith API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 
