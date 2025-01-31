import React from 'react';
import { trpc } from '@/app/lib/trpc/client';
import { TicketStatus, TicketPriority } from '@/app/types/tickets';
import { useAuth } from '@/app/lib/auth/AuthContext';
import { TicketDialog } from './TicketDialog';
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
  SortableContext, 
  sortableKeyboardCoordinates, 
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { MessageCircle, ArrowUpDown, Tags, X, Loader2 } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Checkbox } from '@/app/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from '@/app/components/ui/dropdown-menu';
import { Badge } from '@/app/components/ui/badge';
import { SortableItem } from '@/app/components/common/SortableItem';
import { RichTextContent } from '@/app/components/ui/rich-text-editor';
import { MarketplaceDialog } from '../marketplace/MarketplaceDialog';

const STAFF_ROLES = ['ADMIN', 'MANAGER', 'AGENT'] as const;

// Define the raw ticket type as it comes from the server
interface RawTicket {
  id: string;
  title: string;
  description: string;
  description_html: string;
  status: string;
  priority: string;
  customer_id: string;
  assigned_to_id: string | null;
  created_by_id: string;
  last_updated_by_id: string | null;
  tags: string[];
  created_by: {
    name: string | null;
    email: string | null;
    role: string;
  };
  assigned_to: {
    name: string | null;
    email: string | null;
  } | null;
  last_updated_by: {
    name: string | null;
    email: string | null;
  } | null;
  message_count: number;
  created_at: string;
  updated_at: string;
}

// Define the processed ticket type with proper enum types
export interface ProcessedTicket extends RawTicket {
  statusDisplay: string;
  priorityDisplay: string;
  priorityColor: string;
}

interface TicketListProps {
  filterByUser?: string;
}

const STATUS_DISPLAY: Record<TicketStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  PENDING: 'Pending',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

const PRIORITY_DISPLAY: Record<TicketPriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
};

const PRIORITY_COLORS: Record<TicketPriority, string> = {
  LOW: 'bg-green-100 text-green-800',
  MEDIUM: 'bg-yellow-100 text-yellow-800',
  HIGH: 'bg-red-100 text-red-800',
  URGENT: 'bg-purple-100 text-purple-800',
};

export const TicketList: React.FC<TicketListProps> = ({ filterByUser }) => {
  const { role, user } = useAuth();
  const utils = trpc.useContext();
  const [showCompleted, setShowCompleted] = React.useState(false);
  const [assignedToMe, setAssignedToMe] = React.useState(false);
  const [sortCriteria, setSortCriteria] = React.useState<Array<{
    field: 'priority' | 'updated_at';
    order: 'asc' | 'desc';
  }>>([
    { field: 'priority', order: 'desc' },
    { field: 'updated_at', order: 'desc' }
  ]);
  const [selectedTags, setSelectedTags] = React.useState<string[]>([]);
  const [includeUntagged, setIncludeUntagged] = React.useState(false);
  const [isSortMenuOpen, setIsSortMenuOpen] = React.useState(false);
  const [filterByTeamTags, setFilterByTeamTags] = React.useState(false);
  const [selectedTicket, setSelectedTicket] = React.useState<ProcessedTicket | null>(null);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [isMarketplaceDialogOpen, setIsMarketplaceDialogOpen] = React.useState(false);

  // Get user's team tags
  const { data: teamTags } = trpc.team.getUserTeamTags.useQuery(undefined, {
    enabled: filterByTeamTags,
  });

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const {
    data: ticketsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = trpc.ticket.list.useInfiniteQuery(
    {
      limit: 10,
      show_completed: showCompleted,
      assigned_to_me: assignedToMe,
      sort_criteria: sortCriteria,
      tags: filterByTeamTags ? teamTags || [] : selectedTags,
      include_untagged: includeUntagged,
      ...(filterByUser ? { customer_id: filterByUser } : {}),
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      keepPreviousData: true,
    }
  );

  const tickets = React.useMemo(() => {
    if (!ticketsData?.pages) return [];
    
    // Since we're using proper cursor-based pagination with stable sorting,
    // we can safely concatenate the pages
    return ticketsData.pages.flatMap((page) => 
      page.tickets.map((rawTicket): ProcessedTicket => {
        // Ensure the data matches our expected types
        const ticket: RawTicket = {
          ...rawTicket,
          status: rawTicket.status as TicketStatus,
          priority: rawTicket.priority as TicketPriority,
        };

        // Process the ticket data
        return {
          ...ticket,
          statusDisplay: STATUS_DISPLAY[ticket.status as TicketStatus],
          priorityDisplay: PRIORITY_DISPLAY[ticket.priority as TicketPriority],
          priorityColor: PRIORITY_COLORS[ticket.priority as TicketPriority],
        };
      })
    );
  }, [ticketsData?.pages]);

  // Get unique tags from all tickets
  const availableTags = React.useMemo(() => {
    const tagSet = new Set<string>();
    tickets.forEach(ticket => {
      ticket.tags?.forEach(tag => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [tickets]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag end for sort items
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      setSortCriteria(prev => {
        const oldIndex = prev.findIndex(item => item.field === active.id);
        const newIndex = prev.findIndex(item => item.field === over.id);
        
        if (oldIndex !== -1 && newIndex !== -1) {
          const newCriteria = [...prev];
          const [movedItem] = newCriteria.splice(oldIndex, 1);
          newCriteria.splice(newIndex, 0, movedItem);
          return newCriteria;
        }
        return prev;
      });
    }
  };

  const toggleSortDirection = (field: 'priority' | 'updated_at') => {
    setSortCriteria(prev => 
      prev.map(criteria => 
        criteria.field === field 
          ? { ...criteria, order: criteria.order === 'asc' ? 'desc' : 'asc' }
          : criteria
      )
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
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
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

            {/* Assigned to me toggle */}
            <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm px-3 py-2 rounded-lg border border-white/20">
              <Checkbox
                id="assigned-to-me"
                checked={assignedToMe}
                onCheckedChange={(checked: boolean) => setAssignedToMe(checked)}
                className="border-white/50 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500"
              />
              <label htmlFor="assigned-to-me" className="text-sm text-white font-medium select-none">
                Assigned to me
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

          <div className="flex items-center space-x-4">
            {/* Sort dropdown */}
            <DropdownMenu open={isSortMenuOpen} onOpenChange={setIsSortMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <ArrowUpDown className="h-4 w-4" />
                  Sort
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel className="px-2 pb-2">Sort Order</DropdownMenuLabel>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={sortCriteria.map(c => c.field)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-1">
                      {sortCriteria.map((criteria, index) => (
                        <SortableItem
                          key={criteria.field}
                          id={criteria.field}
                          label={
                            criteria.field === 'priority'
                              ? 'Priority'
                              : 'Last Updated'
                          }
                          isActive={true}
                          order={index + 1}
                          direction={criteria.order}
                          onDirectionChange={() => toggleSortDirection(criteria.field)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Filter tags */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Tags className="h-4 w-4" />
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

            {/* Clear filters */}
            {(selectedTags.length > 0 || includeUntagged || assignedToMe) && (
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => {
                  setSelectedTags([]);
                  setIncludeUntagged(false);
                  setAssignedToMe(false);
                }}
              >
                <X className="h-4 w-4" />
                Clear Filters
              </Button>
            )}
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
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
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

          {/* Assigned to me toggle */}
          <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm px-3 py-2 rounded-lg border border-white/20">
            <Checkbox
              id="assigned-to-me"
              checked={assignedToMe}
              onCheckedChange={(checked: boolean) => setAssignedToMe(checked)}
              className="border-white/50 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500"
            />
            <label htmlFor="assigned-to-me" className="text-sm text-white font-medium select-none">
              Assigned to me
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

        <div className="flex items-center space-x-4">
          {/* Sort dropdown */}
          <DropdownMenu open={isSortMenuOpen} onOpenChange={setIsSortMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <ArrowUpDown className="h-4 w-4" />
                Sort
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel className="px-2 pb-2">Sort Order</DropdownMenuLabel>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={sortCriteria.map(c => c.field)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-1">
                    {sortCriteria.map((criteria, index) => (
                      <SortableItem
                        key={criteria.field}
                        id={criteria.field}
                        label={
                          criteria.field === 'priority'
                            ? 'Priority'
                            : 'Last Updated'
                        }
                        isActive={true}
                        order={index + 1}
                        direction={criteria.order}
                        onDirectionChange={() => toggleSortDirection(criteria.field)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Filter tags */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Tags className="h-4 w-4" />
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

          {/* Clear filters */}
          {(selectedTags.length > 0 || includeUntagged || assignedToMe) && (
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => {
                setSelectedTags([]);
                setIncludeUntagged(false);
                setAssignedToMe(false);
              }}
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
                        : ticket.created_by.role && STAFF_ROLES.includes(ticket.created_by.role as typeof STAFF_ROLES[number])
                          ? 'Self-assigned'
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
                      : ticket.status === TicketStatus.CLOSED
                      ? 'bg-gray-100 text-gray-800'
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
                <span>by {
                  ticket.last_updated_by
                    ? ticket.last_updated_by.name || ticket.last_updated_by.email || 'unknown'
                    : 'unknown'
                }</span>
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
      <MarketplaceDialog
        open={isMarketplaceDialogOpen}
        onOpenChange={setIsMarketplaceDialogOpen}
      />
    </div>
  );
};