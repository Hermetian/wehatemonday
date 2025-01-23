import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import { Badge } from '@/app/components/ui/badge';
import { X } from 'lucide-react';
import { useAuth } from '@/app/lib/auth/AuthContext';
import { trpc } from '@/app/lib/trpc/client';
import { UserRole } from '@prisma/client';
import { TicketStatus, TicketPriority } from '@/app/types/tickets';
import { TicketMessages } from './TicketMessages';

// Import the ServerTicket type from TicketList
interface ServerTicket {
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
}

interface TicketDialogProps {
  ticket: ServerTicket;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTicketUpdated: () => void;
}

const STAFF_ROLES = [UserRole.ADMIN, UserRole.MANAGER, UserRole.AGENT] as const;
const ASSIGNMENT_ROLES = [UserRole.ADMIN, UserRole.MANAGER] as const;

export const TicketDialog: React.FC<TicketDialogProps> = ({
  ticket,
  open,
  onOpenChange,
  onTicketUpdated,
}) => {
  const { role } = useAuth();
  const utils = trpc.useContext();
  
  // Form state
  const [title, setTitle] = React.useState(ticket.title);
  const [description, setDescription] = React.useState(ticket.description);
  const [status, setStatus] = React.useState<TicketStatus>(ticket.status);
  const [priority, setPriority] = React.useState<TicketPriority>(ticket.priority);
  const [assignedToId, setAssignedToId] = React.useState<string | null>(ticket.assignedToId);
  const [tags, setTags] = React.useState(ticket.tags);
  const [newTag, setNewTag] = React.useState('');

  // Get staff users for assignment
  const { data: staffUsers } = trpc.ticket.getStaffUsers.useQuery(undefined, {
    enabled: role ? ASSIGNMENT_ROLES.includes(role as typeof ASSIGNMENT_ROLES[number]) : false,
  });

  // Update mutation
  const updateMutation = trpc.ticket.update.useMutation({
    onSuccess: () => {
      utils.ticket.list.invalidate();
      onTicketUpdated();
    },
  });

  const canEditAll = role && STAFF_ROLES.includes(role as typeof STAFF_ROLES[number]);
  const canAssign = role && ASSIGNMENT_ROLES.includes(role as typeof ASSIGNMENT_ROLES[number]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    const updates: Partial<{
      title: string;
      description: string;
      status: TicketStatus;
      priority: TicketPriority;
      assignedToId: string;
      tags: string[];
    }> = {};
    
    // Only include changed fields
    if (description !== ticket.description) updates.description = description;
    if (canEditAll) {
      if (title !== ticket.title) updates.title = title;
      if (status !== ticket.status) updates.status = status;
      if (priority !== ticket.priority) updates.priority = priority;
      if (JSON.stringify(tags) !== JSON.stringify(ticket.tags)) updates.tags = tags;
    }
    if (canAssign && assignedToId !== ticket.assignedToId) {
      updates.assignedToId = assignedToId || undefined;
    }

    if (Object.keys(updates).length > 0) {
      await updateMutation.mutateAsync({
        id: ticket.id,
        ...updates,
      });
    }
  };

  const handleAddTag = () => {
    if (newTag && !tags.includes(newTag)) {
      setTags([...tags, newTag]);
      setNewTag('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ticket Details</DialogTitle>
        </DialogHeader>

        <div className="grid gap-6">
          {/* Ticket Details Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
                disabled={!canEditAll}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
                rows={4}
              />
            </div>

            {canEditAll && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <Select value={status} onValueChange={(value: TicketStatus) => setStatus(value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(TicketStatus).map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="priority">Priority</Label>
                    <Select value={priority} onValueChange={(value: TicketPriority) => setPriority(value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(TicketPriority).map((p) => (
                          <SelectItem key={p} value={p}>
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Tags</Label>
                  <div className="flex gap-2">
                    <Input
                      value={newTag}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTag(e.target.value)}
                      placeholder="Add a tag"
                    />
                    <Button type="button" onClick={handleAddTag}>
                      Add
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {tags.map((tag: string) => (
                      <Badge key={tag} variant="secondary" className="gap-1">
                        {tag}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
              </>
            )}

            {canAssign && staffUsers && (
              <div className="space-y-2">
                <Label htmlFor="assignedTo">Assigned To</Label>
                <Select
                  value={assignedToId || 'unassigned'}
                  onValueChange={(value) => setAssignedToId(value === 'unassigned' ? null : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {staffUsers.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name || user.email} ({user.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updateMutation.isLoading}>
                {updateMutation.isLoading ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>

          {/* Messages Section */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold mb-4">Messages</h3>
            <TicketMessages ticketId={ticket.id} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TicketDialog; 