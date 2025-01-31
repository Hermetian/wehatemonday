import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { trpc } from '@/app/lib/trpc/client';
import { Alert, AlertTitle, AlertDescription } from '../ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Loader2, AlertCircle, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/lib/auth/AuthContext';
import { marked } from 'marked';
import { Input } from '../ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../ui/select';
import { ProcessedTicketForm } from './ProcessedTicketForm';
import type { TicketPriority } from '@/app/types/tickets';

interface MarketplaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Share this interface with ProcessedTicketForm
export interface ProcessedTicket {
  title: string;
  description: string;
  priority: TicketPriority;
  tags: string[];
}

// Type predicate function
function isProcessedTicket(ticket: ProcessedTicket | null): ticket is ProcessedTicket {
  return ticket !== null && 
    typeof ticket.title === 'string' &&
    typeof ticket.description === 'string' &&
    typeof ticket.priority === 'string' &&
    Array.isArray(ticket.tags);
}

export const MarketplaceDialog: React.FC<MarketplaceDialogProps> = ({
  open,
  onOpenChange,
}) => {
  const router = useRouter();
  const { user } = useAuth();
  const utils = trpc.useContext();
  const [content, setContent] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [alert, setAlert] = React.useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [processedTicket, setProcessedTicket] = React.useState<ProcessedTicket | null>(null);
  const [waitForProcessing, setWaitForProcessing] = React.useState(false);
  const [isConfirming, setIsConfirming] = React.useState(false);
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [isEditing, setIsEditing] = React.useState(false);
  const [runId, setRunId] = React.useState<string | null>(null);

  const createTicket = trpc.ticket.create.useMutation({
    onError: (error) => {
      setAlert({ 
        type: 'error', 
        message: error.message || 'Failed to create ticket' 
      });
      setIsConfirming(false);
    }
  });

  const createMarketplace = trpc.marketplace.create.useMutation({
    onSuccess: (data) => {
      setAlert({ type: 'success', message: 'Marketplace conversation uploaded successfully' });
      setContent('');
      setConversationId(data.id);
      if (waitForProcessing) {
        processConversation.mutate({ id: data.id });
      } else {
        onOpenChange(false);
      }
    },
    onError: (error) => {
      setAlert({ 
        type: 'error', 
        message: error.message || 'Failed to upload marketplace conversation' 
      });
    },
    onSettled: () => {
      setIsSubmitting(false);
    },
  });

  const processConversation = trpc.marketplace.process.useMutation({
    onMutate: () => {
      setIsProcessing(true);
      setAlert({ type: 'info', message: 'Processing conversation...' });
    },
    onSuccess: (data) => {
      setProcessedTicket({
        title: data.processed.title,
        description: data.processed.description,
        priority: data.processed.priority as ProcessedTicket['priority'],
        tags: data.processed.tags || []
      });
      setRunId(data.runId);
      setAlert({ type: 'success', message: 'Conversation processed successfully. Please review the ticket details.' });
    },
    onError: (error) => {
      setAlert({ 
        type: 'error', 
        message: error.message || 'Failed to process conversation' 
      });
    },
    onSettled: () => {
      setIsProcessing(false);
    },
  });

  const updateTicketId = trpc.marketplace.updateTicketId.useMutation({
    onError: (error) => {
      console.error('Failed to update marketplace conversation:', error);
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      setAlert({ type: 'error', message: 'Please enter a conversation' });
      return;
    }

    // Basic validation for conversation format
    if (!content.includes(':')) {
      setAlert({ type: 'error', message: 'Invalid conversation format. Please ensure the conversation includes speaker labels (e.g., "Customer:", "Agent:")' });
      return;
    }

    setIsSubmitting(true);
    createMarketplace.mutate({ rawContent: content.trim() });
  };

  const handleCreateTicket = async () => {
    if (!processedTicket || !user || !conversationId) return;

    setIsConfirming(true);
    try {
      // Convert description to HTML using marked
      const descriptionHtml = await marked(processedTicket.description);

      // Add Marketplace tag to existing tags
      const tags = ['Marketplace', ...(processedTicket.tags || [])];

      // Get the marketplace conversation to find the creator
      const conversation = await utils.marketplace.getById.fetch({ id: conversationId });

      if (!conversation) {
        throw new Error('Failed to get conversation details');
      }

      const ticket = await createTicket.mutateAsync({
        title: processedTicket.title,
        description: processedTicket.description,
        description_html: descriptionHtml,
        priority: processedTicket.priority,
        customer_id: conversation.created_by_id,
        created_by_id: user.id,
        tags,
        assigned_to_id: undefined,
      });

      // Update the marketplace conversation with the ticket ID
      if (ticket?.id) {
        await updateTicketId.mutateAsync({
          id: conversationId,
          ticketId: ticket.id
        });
        
        setAlert({ type: 'success', message: 'Ticket created successfully' });
        // Use setTimeout to show the success message briefly before closing
        setTimeout(() => {
          handleClose();
          router.push('/homepage');
        }, 1500);
      } else {
        console.error('No ticket ID returned from creation');
        throw new Error('Failed to get ticket ID');
      }
    } catch (error) {
      console.error('Error in ticket creation/update:', error);
      setAlert({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to process ticket'
      });
      setIsConfirming(false);
    }
  };

  const handleClose = () => {
    // Reset all states
    setContent('');
    setProcessedTicket(null);
    setAlert(null);
    setWaitForProcessing(false);
    setIsConfirming(false);
    setIsProcessing(false);
    setConversationId(null);
    setIsSubmitting(false);
    setIsEditing(false);
    setRunId(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-[#0A1A2F] border-[#1E2D3D] max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            Upload Marketplace Conversation
            {isProcessing && <Loader2 className="h-4 w-4 animate-spin" />}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {alert && (
            <Alert variant={alert.type === 'error' ? 'destructive' : alert.type === 'info' ? 'default' : 'default'}>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>{alert.type === 'error' ? 'Error' : alert.type === 'info' ? 'Info' : 'Success'}</AlertTitle>
              <AlertDescription>{alert.message}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            {!processedTicket ? (
              <>
                <div className="bg-[#1E2D3D] p-4 rounded-lg border border-[#2E3D4D]">
                  <p className="text-sm text-muted-foreground mb-2">
                    Paste your marketplace conversation below. Make sure it includes proper speaker labels (e.g., "Customer:", "Agent:").
                  </p>
                  <Textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Customer: Hi, I'm interested in the property at..."
                    className="min-h-[200px] bg-[#1E2D3D] border-[#1E2D3D] text-foreground placeholder:text-muted-foreground"
                  />
                </div>

                <div className="flex space-x-4">
                  <Button
                    type="submit"
                    disabled={isSubmitting || !content.trim()}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium"
                  >
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Upload Only
                  </Button>
                  <Button
                    type="button"
                    disabled={isSubmitting || !content.trim()}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium"
                    onClick={() => {
                      setWaitForProcessing(true);
                      handleSubmit(new Event('submit') as any);
                    }}
                  >
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Upload and Process
                  </Button>
                </div>
              </>
            ) : (
              <ProcessedTicketForm
                ticket={processedTicket}
                runId={runId}
                isEditing={isEditing}
                onStartOver={() => {
                  setProcessedTicket(null);
                  setContent('');
                  setAlert(null);
                  setIsEditing(false);
                }}
                onEdit={() => setIsEditing(true)}
                onCancelEdit={() => setIsEditing(false)}
                onSaveChanges={(editedTicket) => {
                  setProcessedTicket(editedTicket);
                  setIsEditing(false);
                }}
                onCreateTicket={handleCreateTicket}
                isConfirming={isConfirming}
              />
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default MarketplaceDialog;
