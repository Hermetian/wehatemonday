import React from 'react';
import { trpc } from '../utils/trpc';
import { TicketStatus, TicketPriority } from '../types';

// Define the full ticket type as it comes from the server
interface ServerTicket {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  customerId: string;
  assignedToId: string | null;
  createdById: string;
  tags: string[];
}

interface TicketPage {
  tickets: ServerTicket[];
  nextCursor?: string;
}

interface TicketListProps {
  filterByUser?: string;
}

export const TicketList: React.FC<TicketListProps> = ({ filterByUser }) => {
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
    return <div>Loading tickets...</div>;
  }

  if (!tickets || tickets.length === 0) {
    return <div>No tickets found.</div>;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Tickets</h2>
      <div className="grid gap-4">
        {tickets.map((ticket) => (
          <div
            key={ticket.id}
            className="p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow"
          >
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-semibold text-gray-900">{ticket.title}</h3>
                <p className="text-gray-800 text-sm">{ticket.description}</p>
              </div>
              <div className="flex gap-2">
                <span
                  className={`px-2 py-1 rounded-full text-xs ${
                    ticket.priority === TicketPriority.HIGH
                      ? 'bg-red-100 text-red-800'
                      : ticket.priority === TicketPriority.MEDIUM
                      ? 'bg-yellow-100 text-yellow-800'
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
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {ticket.status}
                </span>
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
    </div>
  );
};

export default TicketList;