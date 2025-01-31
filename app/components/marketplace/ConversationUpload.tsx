'use client';

import { useState } from 'react';
import { Button } from '@/app/components/ui/button';
import { Textarea } from '@/app/components/ui/textarea';
import { trpc } from '@/app/lib/trpc/client';
import { Dialog } from '@/app/components/ui/dialog';
import { CreateTicketDialog } from '@/app/components/tickets/CreateTicketDialog';

// Define ProcessedTicketData locally since it's not exported from langsmith
interface ProcessedTicketData {
  title: string;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  tags: string[];
}

export function ConversationUpload() {
  const [content, setContent] = useState('');
  const [showCreateTicket, setShowCreateTicket] = useState(false);
  const [processedData, setProcessedData] = useState<ProcessedTicketData | null>(null);
  const [originalProcessed, setOriginalProcessed] = useState<ProcessedTicketData | null>(null);
  const [runId, setRunId] = useState<string | null>(null);

  const createConversation = trpc.marketplace.create.useMutation({
    onSuccess: (data) => {
      processConversation.mutate({ id: data.id });
    },
  });

  const processConversation = trpc.marketplace.process.useMutation({
    onSuccess: (data) => {
      setProcessedData(data.processed);
      setOriginalProcessed(data.processed);
      setRunId(data.runId);
    },
  });

  const provideFeedback = trpc.marketplace.provideFeedback.useMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    createConversation.mutate({ rawContent: content });
  };

  const handleCreateTicket = () => {
    setShowCreateTicket(true);
  };

  const handleTicketCreated = async (ticketData: ProcessedTicketData) => {
    // If we have feedback data, send it
    if (originalProcessed && runId) {
      await provideFeedback.mutateAsync({
        runId,
        originalProcessed,
        finalTicket: ticketData,
        feedbackText: 'Manual ticket creation from processed conversation'
      });
    }

    setShowCreateTicket(false);
    setContent('');
    setProcessedData(null);
    setOriginalProcessed(null);
    setRunId(null);
  };

  const handleStartOver = () => {
    setContent('');
    setProcessedData(null);
    setOriginalProcessed(null);
    setRunId(null);
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Paste your marketplace conversation here..."
          className="min-h-[200px]"
          disabled={createConversation.isLoading || processConversation.isLoading}
        />
        <Button
          type="submit"
          disabled={!content.trim() || createConversation.isLoading || processConversation.isLoading}
          className="w-full"
        >
          {createConversation.isLoading || processConversation.isLoading ? (
            <span className="flex items-center space-x-2">
              <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Processing...</span>
            </span>
          ) : (
            'Upload & Process'
          )}
        </Button>
      </form>

      {processedData && (
        <div className="space-y-4 pt-4 border-t">
          <div className="flex justify-between">
            <Button onClick={handleStartOver} variant="outline">
              Start Over
            </Button>
            <Button onClick={handleCreateTicket} variant="outline">
              Create Ticket
            </Button>
            <Button onClick={handleCreateTicket} variant="outline">
              Edit Ticket
            </Button>
          </div>
        </div>
      )}

      <Dialog open={showCreateTicket} onOpenChange={setShowCreateTicket}>
        <CreateTicketDialog
          initialData={processedData}
          onClose={() => setShowCreateTicket(false)}
          onCreated={handleTicketCreated}
        />
      </Dialog>
    </div>
  );
} 
