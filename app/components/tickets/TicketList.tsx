import React from 'react';
import { trpc } from '@/app/lib/trpc/client';
import { TicketStatus, TicketPriority, SortConfig } from '@/app/types/tickets';
import { useAuth } from '@/app/lib/auth/AuthContext';
import { TicketDialog } from './TicketDialog';
import { MessageCircle, SortAsc, Filter, X, Loader2 } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Checkbox } from '@/app/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuCheckboxItem,
} from '@/app/components/ui/dropdown-menu';
import { Badge } from '@/app/components/ui/badge';
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
import { SortableItem } from '@/app/components/common/SortableItem';
import { RichTextContent } from '@/app/components/ui/rich-text-editor';

// Define the raw ticket type as it comes from the server
interface RawTicket {
  id: string;
  created_at: string;
  updated_at: string;
  title: string;
  description: string;
  description_html: string;
  status: string;
  priority: string;
  customer_id: string;
  assigned_to_id: string | null;
  created_by_id: string;
  tags: string[];
  created_by: {
    name: string | null;
    email: string | null;
  };
  assigned_to: {
    name: string | null;
    email: string | null;
  } | null;
  last_updated_by: {
    name: string | null;
    email: string | null;
  };
  message_count: number;
}

// Define the processed ticket type with proper enum types
export interface ProcessedTicket extends Omit<RawTicket, 'status' | 'priority'> {
  status: TicketStatus;
  priority: TicketPriority;
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
  const utils = trpc.useContext();
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
  const [filterByTeamTags, setFilterByTeamTags] = React.useState(false);
  const [selectedTicket, setSelectedTicket] = React.useState<ProcessedTicket | null>(null);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);

  // Get user's team tags
  const { data: teamTags } = trpc.team.getUserTeamTags.useQuery(undefined, {
    enabled: filterByTeamTags,
  });

  // Effect to update selected tags when filterByTeamTags changes
  React.useEffect(() => {
    if (filterByTeamTags && teamTags) {
      setSelectedTags(teamTags);
    } else if (!filterByTeamTags) {
      setSelectedTags([]);
    }
  }, [filterByTeamTags, teamTags]);

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
    isFetchingNextPage,
  } = trpc.ticket.list.useInfiniteQuery(
    {
      limit: 10,
      show_completed: showCompleted,
      sort_by: sortConfig[0]?.field === 'assignedToMe' 
        ? 'updated_at' 
        : sortConfig[0]?.field === 'updatedAt' 
          ? 'updated_at' 
          : sortConfig[0]?.field,
      sort_order: sortConfig[0]?.direction || 'desc',
      tags: selectedTags,
      include_untagged: includeUntagged,
      ...(filterByUser ? { customer_id: filterByUser } : {})
    },
    {
      getNextPageParam: (lastPage) => lastPage.next_cursor,
    }
  );

  const tickets = React.useMemo((): ProcessedTicket[] => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page) => 
      page.tickets.map((rawTicket): ProcessedTicket => {
        // Ensure the data matches our expected types
        const ticket: RawTicket = {
          id: rawTicket.id,
          title: rawTicket.title,
          description: rawTicket.description,
          description_html: rawTicket.description_html,
          status: rawTicket.status,
          priority: rawTicket.priority,
          customer_id: rawTicket.customer_id,
          assigned_to_id: rawTicket.assigned_to_id,
          created_by_id: rawTicket.created_by_id,
          tags: Array.isArray(rawTicket.tags) ? rawTicket.tags : [],
          created_by: {
            name: rawTicket.created_by?.name ?? null,
            email: rawTicket.created_by?.email ?? null
          },
          assigned_to: rawTicket.assigned_to ? {
            name: rawTicket.assigned_to.name ?? null,
            email: rawTicket.assigned_to.email ?? null
          } : null,
          last_updated_by: {
            name: rawTicket.last_updated_by?.name ?? null,
            email: rawTicket.last_updated_by?.email ?? null
          },
          message_count: rawTicket.message_count,
          created_at: rawTicket.created_at,
          updated_at: rawTicket.updated_at
        };

        return {
          ...ticket,
          status: ticket.status as TicketStatus,
          priority: ticket.priority as TicketPriority
        };
      })
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

  const handleLoadMore = () => {
    if (!isFetchingNextPage) {
      fetchNextPage();
    }
  };

  const handleTicketClick = (ticket: ProcessedTicket) => {
    setSelectedTicket(ticket);
    setIsDialogOpen(true);
  };

  if (isLoading) {
    return <div className="flex justify-center items-center p-8">
      <Loader2 className="h-8 w-8 animate-spin text-gray-900" />
    </div>;
  }

  if (!tickets || tickets.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
          <h2 className="text-2xl font-bold">
            {role === 'CUSTOMER' ? 'My Tickets' : 'All Tickets'}
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
                Show closed/resolved tickets
              </label>
            </div>

            {/* Filter by team tags toggle */}
            <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm px-3 py-2 rounded-lg border border-white/20">
              <Checkbox
                id="filter-team-tags"
                checked={filterByTeamTags}
                onCheckedChange={(checked: boolean) => setFilterByTeamTags(checked)}
                className="border-white/50 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500"
              />
              <label htmlFor="filter-team-tags" className="text-sm text-white font-medium select-none">
                Filter by my team tags
              </label>
            </div>
          </div>
        </div>
        <div className="text-center p-8 bg-white/10 backdrop-blur-sm rounded-lg border border-white/20">
          <p className="text-gray-300">
            {selectedTags.length > 0 
              ? "No tickets found matching the selected tag filters." 
              : !showCompleted 
                ? "No open tickets found. Try showing closed/resolved tickets." 
                : "No tickets found."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
        <h2 className="text-2xl font-bold">
          {role === 'CUSTOMER' ? 'My Tickets' : 'All Tickets'}
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
              Show closed/resolved tickets
            </label>
          </div>

          {/* Filter by team tags toggle */}
          <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm px-3 py-2 rounded-lg border border-white/20">
            <Checkbox
              id="filter-team-tags"
              checked={filterByTeamTags}
              onCheckedChange={(checked: boolean) => setFilterByTeamTags(checked)}
              className="border-white/50 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500"
            />
            <label htmlFor="filter-team-tags" className="text-sm text-white font-medium select-none">
              Filter by my team tags
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
            onClick={() => handleTicketClick(ticket)}
          >
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900">{ticket.title}</h3>
                  {ticket.message_count > 0 && (
                    <div className="flex items-center gap-1 text-sm text-blue-600">
                      <MessageCircle className="h-4 w-4" />
                      <span>{ticket.message_count}</span>
                    </div>
                  )}
                </div>
                <div className="text-gray-800 text-sm prose prose-sm max-w-none">
                  <RichTextContent content={ticket.description_html || ticket.description} />
                </div>
                
                {/* Show customer and assigned agent info for non-customers */}
                {role !== 'CUSTOMER' && (
                  <div className="text-sm text-gray-600 space-y-1">
                    <p>
                      <span className="font-medium">Customer:</span>{' '}
                      {ticket.created_by.name || ticket.created_by.email}
                    </p>
                    <p>
                      <span className="font-medium">Assigned to:</span>{' '}
                      {ticket.assigned_to
                        ? ticket.assigned_to.name || ticket.assigned_to.email
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
              <div>Created: {new Date(ticket.created_at).toLocaleDateString()}</div>
              <div className="flex items-center gap-1">
                <span>Last updated: {new Date(ticket.updated_at).toLocaleString()}</span>
                <span>by {ticket.last_updated_by.name || ticket.last_updated_by.email}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={handleLoadMore}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              'Load More'
            )}
          </Button>
        </div>
      )}

      {selectedTicket && (
        <TicketDialog
          ticket={selectedTicket}
          open={isDialogOpen}
          onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              setSelectedTicket(null);
            }
          }}
          onTicketUpdated={() => {
            // Refetch tickets after update
            utils.ticket.list.invalidate();
          }}
        />
      )}
    </div>
  );
};

export default TicketList;