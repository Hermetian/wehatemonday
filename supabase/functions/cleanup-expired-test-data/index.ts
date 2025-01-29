// @deno-types="https://deno.land/std@0.177.0/http/server.ts"
// @ts-ignore
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

// Declare Deno namespace for TypeScript
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          test_batch_id: string | null;
          cleanup_at: string | null;
        };
        Insert: {
          id?: string;
          test_batch_id?: string | null;
          cleanup_at?: string | null;
        };
        Update: {
          id?: string;
          test_batch_id?: string | null;
          cleanup_at?: string | null;
        };
      };
      tickets: {
        Row: {
          id: string;
          created_by_id: string;
          assigned_to_id: string | null;
        };
      };
      audit_logs: {
        Row: {
          id: string;
          user_id: string;
          entity: string;
          entity_id: string;
        };
      };
      team_members: {
        Row: {
          id: string;
          user_id: string;
        };
      };
      messages: {
        Row: {
          id: string;
          ticket_id: string;
        };
      };
    };
  };
}

serve(async (req: Request) => {
  try {
    // Create Supabase client using service role key
    const supabaseAdmin = createClient<Database>(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    // Find all expired test users
    const { data: expiredUsers, error: userError } = await supabaseAdmin
      .from('users')
      .select('id')
      .not('test_batch_id', 'is', null)
      .lte('cleanup_at', new Date().toISOString());

    if (userError) throw userError;
    if (!expiredUsers?.length) {
      return new Response(
        JSON.stringify({ success: true, deletedCount: 0 }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    const userIds = expiredUsers.map((u: { id: string }) => u.id);

    // Delete all related data in order due to foreign key constraints
    // 1. Delete audit logs
    const { error: auditError } = await supabaseAdmin
      .from('audit_logs')
      .delete()
      .in('user_id', userIds);
    if (auditError) throw auditError;

    // 2. Delete team memberships
    const { error: teamMemberError } = await supabaseAdmin
      .from('team_members')
      .delete()
      .in('user_id', userIds);
    if (teamMemberError) throw teamMemberError;

    // 3. Delete messages (through tickets)
    const { data: userTickets, error: ticketQueryError } = await supabaseAdmin
      .from('tickets')
      .select('id')
      .or(`created_by_id.in.(${userIds}),assigned_to_id.in.(${userIds})`);
    if (ticketQueryError) throw ticketQueryError;

    if (userTickets?.length) {
      const ticketIds = userTickets.map((t: { id: string }) => t.id);
      const { error: messageError } = await supabaseAdmin
        .from('messages')
        .delete()
        .in('ticket_id', ticketIds);
      if (messageError) throw messageError;

      // 4. Delete tickets
      const { error: ticketError } = await supabaseAdmin
        .from('tickets')
        .delete()
        .or(`created_by_id.in.(${userIds}),assigned_to_id.in.(${userIds})`);
      if (ticketError) throw ticketError;
    }

    // 5. Finally delete users
    const { error: userDeleteError } = await supabaseAdmin
      .from('users')
      .delete()
      .in('id', userIds);
    if (userDeleteError) throw userDeleteError;

    return new Response(
      JSON.stringify({
        success: true,
        deletedCount: expiredUsers.length
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Test data cleanup error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Failed to cleanup test data',
        details: error instanceof Error ? error.message : String(error)
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}); 
