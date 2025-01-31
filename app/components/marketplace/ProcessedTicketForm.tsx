'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { X } from 'lucide-react';
import { trpc } from '@/app/lib/trpc/client';
import type { ProcessedTicket } from './MarketplaceDialog';
import type { TicketPriority } from '@/app/types/tickets';

interface ProcessedTicketFormProps {
  ticket: ProcessedTicket;
  runId?: string | null;
  isEditing: boolean;
  onStartOver: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaveChanges: (editedTicket: ProcessedTicket) => void;
  onCreateTicket: () => void;
  isConfirming?: boolean;
}

export function ProcessedTicketForm({
  ticket,
  runId,
  isEditing,
  onStartOver,
  onEdit,
  onCancelEdit,
  onSaveChanges,
  onCreateTicket,
  isConfirming = false
}: ProcessedTicketFormProps) {
  const [editedTicket, setEditedTicket] = React.useState<ProcessedTicket | null>(null);
  const [newTag, setNewTag] = React.useState('');

  // Reset edited ticket when entering edit mode
  React.useEffect(() => {
    if (isEditing) {
      setEditedTicket({ ...ticket });
    } else {
      setEditedTicket(null);
    }
  }, [isEditing, ticket]);

  const provideFeedback = trpc.marketplace.provideFeedback.useMutation();

  const handleSaveChanges = async () => {
    if (!editedTicket) return;

    // If we have a runId, send feedback to LangSmith
    if (runId) {
      await provideFeedback.mutateAsync({
        runId,
        originalProcessed: ticket,
        finalTicket: editedTicket,
        feedbackText: 'Manual edits to processed ticket'
      });
    }

    onSaveChanges(editedTicket);
  };

  const displayTicket = isEditing ? editedTicket || ticket : ticket;

  return (
    <div className="space-y-4">
      <Card className="bg-[#1E2D3D] border-[#1E2D3D]">
        <CardHeader>
          <CardTitle className="text-foreground">Processed Ticket</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <span className="font-semibold text-foreground">Title:</span>{' '}
            {isEditing ? (
              <Input
                value={displayTicket.title}
                onChange={(e) => setEditedTicket(prev => ({ ...prev!, title: e.target.value }))}
                className="mt-1 bg-[#2E3D4D] border-[#3E4D5D]"
                placeholder="Enter ticket title"
              />
            ) : (
              <span className="text-muted-foreground">{displayTicket.title}</span>
            )}
          </div>
          <div>
            <span className="font-semibold text-foreground">Priority:</span>{' '}
            {isEditing ? (
              <Select 
                value={displayTicket.priority}
                onValueChange={(value) => setEditedTicket(prev => ({ ...prev!, priority: value as TicketPriority }))}
              >
                <SelectTrigger className="w-[180px] bg-[#2E3D4D] border-[#3E4D5D]">
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">
                    <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">
                      Low
                    </Badge>
                  </SelectItem>
                  <SelectItem value="MEDIUM">
                    <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
                      Medium
                    </Badge>
                  </SelectItem>
                  <SelectItem value="HIGH">
                    <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/20">
                      High
                    </Badge>
                  </SelectItem>
                  <SelectItem value="URGENT">
                    <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20">
                      Urgent
                    </Badge>
                  </SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Badge variant="outline" className="bg-transparent">
                {displayTicket.priority}
              </Badge>
            )}
          </div>
          <div>
            <span className="font-semibold text-foreground">Tags:</span>{' '}
            <div className="flex flex-wrap gap-2 mt-2">
              {displayTicket.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="mr-1 bg-[#2E3D4D] flex items-center gap-1">
                  {tag}
                  {isEditing && (
                    <button
                      type="button"
                      onClick={() => setEditedTicket(prev => ({
                        ...prev!,
                        tags: prev!.tags.filter(t => t !== tag)
                      }))}
                      className="hover:text-red-500 ml-1"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </Badge>
              ))}
              {isEditing && (
                <div className="flex items-center gap-2">
                  <Input
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newTag.trim()) {
                        e.preventDefault();
                        setEditedTicket(prev => ({
                          ...prev!,
                          tags: [...new Set([...prev!.tags, newTag.trim()])]
                        }));
                        setNewTag('');
                      }
                    }}
                    className="w-[150px] h-8 bg-[#2E3D4D] border-[#3E4D5D]"
                    placeholder="Add tag..."
                  />
                </div>
              )}
            </div>
          </div>
          <div>
            <span className="font-semibold text-foreground">Description:</span>
            <div className="mt-2 p-4 bg-[#2E3D4D] rounded-lg">
              {isEditing ? (
                <Textarea
                  value={displayTicket.description}
                  onChange={(e) => setEditedTicket(prev => ({ ...prev!, description: e.target.value }))}
                  className="min-h-[200px] bg-[#2E3D4D] border-[#3E4D5D]"
                  placeholder="Enter description"
                />
              ) : (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {displayTicket.description}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end space-x-4">
        <Button
          type="button"
          variant="outline"
          onClick={onStartOver}
          className="border-[#2E3D4D] text-muted-foreground hover:bg-[#2E3D4D]"
        >
          Start Over
        </Button>
        {isEditing ? (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={onCancelEdit}
              className="border-[#2E3D4D] text-muted-foreground hover:bg-[#2E3D4D]"
            >
              Cancel Edit
            </Button>
            <Button
              type="button"
              onClick={handleSaveChanges}
              disabled={!editedTicket}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium"
            >
              Save Changes
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={onEdit}
            className="border-[#2E3D4D] text-muted-foreground hover:bg-[#2E3D4D]"
          >
            Edit
          </Button>
        )}
        {!isEditing && (
          <Button
            type="button"
            onClick={onCreateTicket}
            disabled={isConfirming}
            className="bg-green-600 hover:bg-green-700 text-white font-medium"
          >
            {isConfirming ? 'Creating Ticket...' : 'Create Ticket'}
          </Button>
        )}
      </div>
    </div>
  );
} 
