import React from 'react';
import { trpc } from '../utils/trpc';
import { TicketStatus, TicketPriority } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '@prisma/client';
import { TicketDialog } from './TicketDialog';
import { MessageCircle } from 'lucide-react';

// Define the full ticket type as it comes from the server
export interface ServerTicket {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  customerId: string;
  assignedToId: string | null;
  createdById: string;
  tags: string[];
  createdBy: {
    name: string | null;
    email: string;
  };
  assignedTo: {
    name: string | null;
    email: string;
  } | null;
  lastUpdatedBy: {
    name: string | null;
    email: string;
  };
  messageCount: number;
}

interface TicketPage {
  tickets: ServerTicket[];
  nextCursor?: string;
}

interface TicketListProps {
  filterByUser?: string;
}

export const TicketList: React.FC<TicketListProps> = ({ filterByUser }) => {
  const { role } = useAuth();
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
  } = trpc.ticket.list.useInfiniteQuery(
    {
      limit: 10,
      ...(filterByUser ? { filterByUser } : {})
    },
    {
      getNextPageParam: (lastPage: TicketPage) => lastPage.nextCursor
    }
  );

  // State for the dialog
  const [selectedTicket, setSelectedTicket] = React.useState<ServerTicket | null>(null);

  // Transform the data to handle string enums
  const tickets = React.useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap(page => 
      page.tickets.map(ticket => ({
        ...ticket,
        status: ticket.status as TicketStatus,
        priority: ticket.priority as TicketPriority
      }))
    );
  }, [data?.pages]);

  if (isLoading) {
    return <div className="flex justify-center items-center p-8">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
    </div>;
  }

  if (!tickets || tickets.length === 0) {
    return <div className="text-center p-8 text-gray-500">No tickets found.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">
          {role === UserRole.CUSTOMER ? 'My Tickets' : 'All Tickets'}
        </h2>
      </div>
      
      <div className="grid gap-4">
        {tickets.map((ticket) => (
          <div
            key={ticket.id}
            className="p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => setSelectedTicket(ticket)}
          >
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900">{ticket.title}</h3>
                  {ticket.messageCount > 0 && (
                    <div className="flex items-center gap-1 text-sm text-blue-600">
                      <MessageCircle className="h-4 w-4" />
                      <span>{ticket.messageCount}</span>
                    </div>
                  )}
                </div>
                <p className="text-gray-800 text-sm">{ticket.description}</p>
                
                {/* Show customer and assigned agent info for non-customers */}
                {role !== UserRole.CUSTOMER && (
                  <div className="text-sm text-gray-600 space-y-1">
                    <p>
                      <span className="font-medium">Customer:</span>{' '}
                      {ticket.createdBy.name || ticket.createdBy.email}
                    </p>
                    <p>
                      <span className="font-medium">Assigned to:</span>{' '}
                      {ticket.assignedTo
                        ? ticket.assignedTo.name || ticket.assignedTo.email
                        : 'Unassigned'}
                    </p>
                  </div>
                )}
                
                {/* Tags */}
                {ticket.tags && ticket.tags.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {ticket.tags.map((tag: string, index: number) => (
                      <span
                        key={index}
                        className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="flex gap-2">
                <span
                  className={`px-2 py-1 rounded-full text-xs ${
                    ticket.priority === TicketPriority.HIGH
                      ? 'bg-red-100 text-red-800'
                      : ticket.priority === TicketPriority.MEDIUM
                      ? 'bg-yellow-100 text-yellow-800'
                      : ticket.priority === TicketPriority.URGENT
                      ? 'bg-purple-100 text-purple-800'
                      : 'bg-green-100 text-green-800'
                  }`}
                >
                  {ticket.priority}
                </span>
                <span
                  className={`px-2 py-1 rounded-full text-xs ${
                    ticket.status === TicketStatus.OPEN
                      ? 'bg-blue-100 text-blue-800'
                      : ticket.status === TicketStatus.IN_PROGRESS
                      ? 'bg-purple-100 text-purple-800'
                      : ticket.status === TicketStatus.PENDING
                      ? 'bg-yellow-100 text-yellow-800'
                      : ticket.status === TicketStatus.RESOLVED
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {ticket.status}
                </span>
              </div>
            </div>
            
            <div className="mt-4 text-sm text-gray-500">
              <div>Created: {new Date(ticket.createdAt).toLocaleDateString()}</div>
              <div className="flex items-center gap-1">
                <span>Last updated: {new Date(ticket.updatedAt).toLocaleString()}</span>
                <span>by {ticket.lastUpdatedBy.name || ticket.lastUpdatedBy.email}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {hasNextPage && (
        <div className="mt-4 text-center">
          <button
            onClick={() => fetchNextPage()}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            Load More
          </button>
        </div>
      )}

      {selectedTicket && (
        <TicketDialog
          ticket={selectedTicket}
          open={!!selectedTicket}
          onOpenChange={(open) => !open && setSelectedTicket(null)}
          onTicketUpdated={() => setSelectedTicket(null)}
        />
      )}
    </div>
  );
};

export default TicketList;