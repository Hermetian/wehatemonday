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
import { TicketStatus, TicketPriority } from '@/app/types/tickets';
import { TicketMessages } from './TicketMessages';
import { StatusBadge } from '@/app/components/ui/status-badge';
import { ProcessedTicket } from './TicketList';
import { RichTextEditor, RichTextContent } from '@/app/components/ui/rich-text-editor';
import { inferRouterInputs } from '@trpc/server';
import type { AppRouter } from '@/app/lib/trpc/routers/_app';

interface TicketDialogProps {
  ticket: ProcessedTicket;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTicketUpdated: () => void;
}

const STAFF_ROLES = ['ADMIN', 'MANAGER', 'AGENT'] as const;
const ASSIGNMENT_ROLES = ['ADMIN', 'MANAGER'] as const;

type UpdateTicketInput = inferRouterInputs<AppRouter>['ticket']['update'];

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
  const [description_html, setDescriptionHtml] = React.useState(ticket.description_html);
  const [status, setStatus] = React.useState<TicketStatus>(ticket.status as TicketStatus);
  const [priority, setPriority] = React.useState<TicketPriority>(ticket.priority as TicketPriority);
  const [assigned_to_id, setAssignedToId] = React.useState<string | null>(ticket.assigned_to_id);
  const [tags, setTags] = React.useState(ticket.tags);
  const [newTag, setNewTag] = React.useState('');
  const [isEditing, setIsEditing] = React.useState(false);

  // Get staff users and customer for assignment
  const { data: assignableUsers } = trpc.ticket.getAssignableUsers.useQuery(
    { ticket_id: ticket.id },
    {
      enabled: role ? ASSIGNMENT_ROLES.includes(role as typeof ASSIGNMENT_ROLES[number]) : false,
    }
  );

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
    
    const updates: Partial<Omit<UpdateTicketInput, 'id'>> = {};
    
    // Only include changed fields
    if (description !== ticket.description) updates.description = description;
    if (description_html !== ticket.description_html) updates.description_html = description_html;
    if (canEditAll) {
    if (title !== ticket.title) updates.title = title;
    if (status !== ticket.status) updates.status = status;
    if (priority !== ticket.priority) updates.priority = priority;
    if (JSON.stringify(tags) !== JSON.stringify(ticket.tags)) updates.tags = tags;
    }
    
    if (canAssign && assigned_to_id !== ticket.assigned_to_id) {
      updates.assigned_to_id = assigned_to_id;
    }

    if (Object.keys(updates).length > 0) {
      try {
        await updateMutation.mutateAsync({
          id: ticket.id,
          ...updates,
        });
        setIsEditing(false); // Close editor on successful save
        onOpenChange(false); // Close the dialog
      } catch (error) {
        console.error('Failed to update ticket:', error);
      }
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
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-100">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-gray-900">Ticket Details</DialogTitle>
        </DialogHeader>

        <div className="grid gap-6">
          {/* Ticket Details Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="title" className="text-gray-700">Title</Label>
              </div>
              <Input
                id="title"
                value={title}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
                disabled={!canEditAll}
                className="bg-white border-gray-200 text-gray-900"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="description" className="text-gray-700">Description</Label>
                {canEditAll && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditing(!isEditing)}
                    className="text-gray-700 hover:text-gray-900 hover:bg-gray-100 border-gray-300"
                  >
                    {isEditing ? 'Cancel' : 'Edit'}
                  </Button>
                )}
              </div>
              <div>
                {isEditing ? (
                  <div className="space-y-4">
                    <RichTextEditor
                      content={description}
                      onChange={(html) => {
                        setDescription(html);
                        setDescriptionHtml(html);
                      }}
                      placeholder="Edit description..."
                      className="min-h-[300px] rounded-lg border border-gray-200 text-gray-900 [&_.tiptap]:text-gray-900 [&_select]:text-gray-900"
                    />
                  </div>
                ) : (
                  <div className="prose prose-sm max-w-none bg-gray-50 rounded-lg p-4 border border-gray-200 text-gray-900">
                    <RichTextContent content={ticket.description_html || ticket.description} />
                  </div>
                )}
              </div>
            </div>

            {canEditAll && (
              <>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="status" className="text-gray-700">Status</Label>
                    <Select value={status} onValueChange={(value: TicketStatus) => setStatus(value)}>
                      <SelectTrigger className="bg-white border-gray-200 text-gray-900">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white border-gray-200">
                        {Object.values(TicketStatus).map((s) => (
                          <SelectItem key={s} value={s} className="text-gray-900 data-[highlighted]:bg-gray-100">
                            <div className="flex items-center gap-2">
                              <StatusBadge status={s}>{s}</StatusBadge>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="priority" className="text-gray-700">Priority</Label>
                    <Select value={priority} onValueChange={(value: TicketPriority) => setPriority(value)}>
                      <SelectTrigger className="bg-white border-gray-200 text-gray-900">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white border-gray-200">
                        {Object.values(TicketPriority).map((p) => (
                          <SelectItem key={p} value={p} className="text-gray-900 data-[highlighted]:bg-gray-100">
                            <div className="flex items-center gap-2">
                              <StatusBadge priority={p}>{p}</StatusBadge>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-gray-700">Tags</Label>
                  <div className="flex flex-wrap gap-2 p-2 bg-gray-50 rounded-lg border border-gray-200 min-h-[44px]">
                    {tags.map((tag: string) => (
                      <Badge key={tag} variant="secondary" className="bg-white text-gray-800 gap-1 border border-gray-200">
                        {tag}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          className="ml-1 hover:text-red-600"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={newTag}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTag(e.target.value)}
                      placeholder="Add a tag"
                      className="bg-white border-gray-200 text-gray-900"
                    />
                    <Button 
                      type="button" 
                      onClick={handleAddTag} 
                      variant="outline"
                      className="text-gray-700 hover:text-gray-900 hover:bg-gray-100 border-gray-300"
                    >
                      Add
                    </Button>
                  </div>
                </div>
              </>
            )}

            {canAssign && assignableUsers && (
              <div className="space-y-2">
                <Label htmlFor="assigned_to" className="text-gray-700">Assigned To</Label>
                <Select 
                  value={assigned_to_id || 'unassigned'} 
                  onValueChange={(value: string) => setAssignedToId(value === 'unassigned' ? null : value)}
                >
                  <SelectTrigger className="bg-white border-gray-200 text-gray-900">
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-gray-200">
                    <SelectItem value="unassigned" className="text-gray-900 hover:text-gray-900 data-[highlighted]:bg-gray-100 data-[highlighted]:text-gray-900">
                      {assignableUsers.find(user => user.is_customer && STAFF_ROLES.includes(user.role as typeof STAFF_ROLES[number])) 
                        ? 'Self-assigned'
                        : 'Unassigned'
                      }
                    </SelectItem>
                    {assignableUsers.map((user) => (
                      <SelectItem key={user.id} value={user.id} className="text-gray-900 hover:text-gray-900 data-[highlighted]:bg-gray-100 data-[highlighted]:text-gray-900">
                        <div className="flex items-center gap-2">
                          <span>{user.name || user.email}</span>
                          <StatusBadge role={user.is_customer ? 'CUSTOMER' : user.role}>
                            {user.is_customer ? 'CUSTOMER' : user.role}
                          </StatusBadge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex justify-between items-center pt-4 border-t border-gray-200">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">Status:</span>
                  <StatusBadge status={status}>{status}</StatusBadge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">Priority:</span>
                  <StatusBadge priority={priority}>{priority}</StatusBadge>
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="text-gray-700 hover:text-gray-900 hover:bg-gray-100 border-gray-300">
                  Cancel
                </Button>
                <Button type="submit" variant="default" className="bg-blue-600 hover:bg-blue-700 text-white">
                  Save Changes
                </Button>
              </div>
            </div>
          </form>

          {/* Messages Section */}
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Messages</h3>
            <div className="text-gray-900 [&_.bg-yellow-50]:!bg-yellow-50 [&_.border-yellow-200]:!border-yellow-200 [&_.text-yellow-600]:!text-yellow-600">
              <TicketMessages ticket_id={ticket.id} tags={tags} />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TicketDialog; 