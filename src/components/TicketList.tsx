import React from 'react';
import { trpc } from '../utils/trpc';
import { TicketStatus, TicketPriority } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '@prisma/client';
import { TicketDialog } from './TicketDialog';
import { MessageCircle, SortAsc, Filter, X } from 'lucide-react';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuCheckboxItem,
} from './ui/dropdown-menu';
import { Badge } from './ui/badge';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { SortableItem } from './SortableItem';

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

interface SortConfig {
  field: 'assignedToMe' | 'priority' | 'updatedAt';
  direction: 'asc' | 'desc';
}

interface TicketListProps {
  filterByUser?: string;
}

const SORT_LABELS: Record<SortConfig['field'], string> = {
  assignedToMe: 'Assigned to me',
  priority: 'Priority',
  updatedAt: 'Last updated',
};

export const TicketList: React.FC<TicketListProps> = ({ filterByUser }) => {
  const { role } = useAuth();
  const [showCompleted, setShowCompleted] = React.useState(false);
  const [sortConfig, setSortConfig] = React.useState<SortConfig[]>([
    { field: 'assignedToMe', direction: 'desc' },
    { field: 'priority', direction: 'desc' },
    { field: 'updatedAt', direction: 'desc' },
  ]);
  const [selectedTags, setSelectedTags] = React.useState<string[]>([]);
  const [includeUntagged, setIncludeUntagged] = React.useState(false);
  const [isSortMenuOpen, setIsSortMenuOpen] = React.useState(false);

  // Set up DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
  } = trpc.ticket.list.useInfiniteQuery(
    {
      limit: 10,
      showCompleted,
      sortConfig,
      tags: selectedTags,
      includeUntagged,
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

  // Get unique tags from all tickets
  const availableTags = React.useMemo(() => {
    const tagSet = new Set<string>();
    tickets.forEach(ticket => {
      ticket.tags.forEach((tag: string) => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [tickets]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      setSortConfig((items) => {
        const oldIndex = items.findIndex((item) => item.field === active.id);
        const newIndex = items.findIndex((item) => item.field === over.id);
        
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const toggleSortDirection = (field: SortConfig['field']) => {
    setSortConfig(prev => 
      prev.map(config => 
        config.field === field
          ? { ...config, direction: config.direction === 'asc' ? 'desc' : 'asc' }
          : config
      )
    );
  };

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

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
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
        <h2 className="text-2xl font-bold">
          {role === UserRole.CUSTOMER ? 'My Tickets' : 'All Tickets'}
        </h2>
        <div className="flex flex-wrap items-center gap-4">
          {/* Show completed tickets toggle */}
          <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm px-3 py-2 rounded-lg border border-white/20">
            <Checkbox
              id="show-completed"
              checked={showCompleted}
              onCheckedChange={(checked: boolean) => setShowCompleted(checked)}
              className="border-white/50 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500"
            />
            <label htmlFor="show-completed" className="text-sm text-white font-medium select-none">
              Show completed tickets
            </label>
          </div>

          {/* Sort dropdown */}
          <DropdownMenu open={isSortMenuOpen} onOpenChange={setIsSortMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <SortAsc className="h-4 w-4" />
                Sort
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72 p-2">
              <DropdownMenuLabel className="px-2 pb-2">Sort Order</DropdownMenuLabel>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={sortConfig.map(config => config.field)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-1">
                    {sortConfig.map((config, index) => (
                      <SortableItem
                        key={config.field}
                        id={config.field}
                        label={SORT_LABELS[config.field]}
                        isActive={true}
                        order={index + 1}
                        direction={config.direction}
                        onDirectionChange={() => toggleSortDirection(config.field)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Filter by tags dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Filter className="h-4 w-4" />
                Filter Tags
                {(selectedTags.length > 0 || includeUntagged) && (
                  <Badge variant="secondary" className="ml-1">
                    {selectedTags.length + (includeUntagged ? 1 : 0)}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Filter by Tags</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {availableTags.map(tag => (
                <DropdownMenuCheckboxItem
                  key={tag}
                  checked={selectedTags.includes(tag)}
                  onCheckedChange={() => toggleTag(tag)}
                >
                  {tag}
                </DropdownMenuCheckboxItem>
              ))}
              {availableTags.length > 0 && <DropdownMenuSeparator />}
              <DropdownMenuCheckboxItem
                checked={includeUntagged}
                onCheckedChange={(checked) => setIncludeUntagged(checked)}
              >
                Include untagged tickets
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Clear filters button */}
          {(selectedTags.length > 0 || includeUntagged) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedTags([]);
                setIncludeUntagged(false);
              }}
              className="gap-2"
            >
              <X className="h-4 w-4" />
              Clear Filters
            </Button>
          )}
        </div>
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