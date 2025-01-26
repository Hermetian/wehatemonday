import { SupabaseClient } from '@supabase/supabase-js';

export async function cleanupExpiredTestData(supabase: SupabaseClient) {
  try {
    // Find expired test users
    const { data: expiredUsers, error: userError } = await supabase
      .from('users')
      .select('id')
      .not('test_batch_id', 'is', null)
      .lt('cleanup_at', new Date().toISOString());

    if (userError) {
      throw userError;
    }

    // Delete expired test users and their related data
    if (expiredUsers.length > 0) {
      const userIds = expiredUsers.map(user => user.id);

      // Delete related tickets first
      const { error: ticketError } = await supabase
        .from('tickets')
        .delete()
        .in('customer_id', userIds);

      if (ticketError) {
        throw ticketError;
      }

      // Delete related messages
      const { error: messageError } = await supabase
        .from('messages')
        .delete()
        .in('user_id', userIds);

      if (messageError) {
        throw messageError;
      }

      // Delete team memberships
      const { error: teamError } = await supabase
        .from('team_members')
        .delete()
        .in('user_id', userIds);

      if (teamError) {
        throw teamError;
      }

      // Finally delete the users
      const { error: deleteError } = await supabase
        .from('users')
        .delete()
        .in('id', userIds);

      if (deleteError) {
        throw deleteError;
      }
    }

    // Find and delete expired test tickets
    const { data: expiredTickets, error: ticketError } = await supabase
      .from('tickets')
      .select('id')
      .not('test_batch_id', 'is', null)
      .lt('cleanup_at', new Date().toISOString());

    if (ticketError) {
      throw ticketError;
    }

    if (expiredTickets.length > 0) {
      const ticketIds = expiredTickets.map(ticket => ticket.id);

      // Delete related messages first
      const { error: messageError } = await supabase
        .from('messages')
        .delete()
        .in('ticket_id', ticketIds);

      if (messageError) {
        throw messageError;
      }

      // Delete the tickets
      const { error: deleteError } = await supabase
        .from('tickets')
        .delete()
        .in('id', ticketIds);

      if (deleteError) {
        throw deleteError;
      }
    }

    return {
      deletedUsers: expiredUsers.length,
      deletedTickets: expiredTickets.length,
    };
  } catch (error) {
    console.error('Error cleaning up test data:', error);
    throw error;
  }
}