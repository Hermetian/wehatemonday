import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { trpc } from '@/app/lib/trpc/client';
import { Alert, AlertTitle, AlertDescription } from '../ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/lib/auth/AuthContext';
import { marked } from 'marked';

interface MarketplaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const MarketplaceDialog: React.FC<MarketplaceDialogProps> = ({
  open,
  onOpenChange,
}) => {
  const router = useRouter();
  const { user } = useAuth();
  const [content, setContent] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [alert, setAlert] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [processedTicket, setProcessedTicket] = React.useState<{
    title: string;
    description: string;
    priority: string;
    tags: string[];
  } | null>(null);
  const [waitForProcessing, setWaitForProcessing] = React.useState(false);

  const createTicket = trpc.ticket.create.useMutation({
    onSuccess: () => {
      setAlert({ type: 'success', message: 'Ticket created successfully' });
      setTimeout(() => {
        onOpenChange(false);
        router.push('/tickets');
      }, 1500);
    },
    onError: (error) => {
      setAlert({ 
        type: 'error', 
        message: error.message || 'Failed to create ticket' 
      });
    }
  });

  const createMarketplace = trpc.marketplace.create.useMutation({
    onSuccess: (data) => {
      setAlert({ type: 'success', message: 'Marketplace conversation uploaded successfully' });
      setContent('');
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
    },
    onSuccess: (data) => {
      setProcessedTicket(data);
      setAlert({ type: 'success', message: 'Conversation processed successfully' });
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setIsSubmitting(true);
    createMarketplace.mutate({ rawContent: content.trim() });
  };

  const handleCreateTicket = () => {
    if (!processedTicket || !user) return;

    // Convert description to HTML using marked
    const descriptionHtml = marked(processedTicket.description);

    createTicket.mutate({
      title: processedTicket.title,
      description: processedTicket.description,
      description_html: descriptionHtml,
      priority: processedTicket.priority as any,
      customer_id: user.id,
      created_by_id: user.id,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0A1A2F] border-[#1E2D3D] max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-foreground">Upload Marketplace Conversation</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {alert && (
            <Alert variant={alert.type === 'error' ? 'destructive' : 'default'}>
              <AlertTitle>{alert.type === 'error' ? 'Error' : 'Success'}</AlertTitle>
              <AlertDescription>{alert.message}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste your marketplace conversation here..."
              className="min-h-[200px] bg-[#1E2D3D] border-[#1E2D3D] text-foreground placeholder:text-muted-foreground"
            />

            {!processedTicket ? (
              <div className="flex space-x-4">
                <Button
                  type="submit"
                  disabled={isSubmitting || !content.trim()}
                  className="flex-1"
                >
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Upload Only
                </Button>
                <Button
                  type="button"
                  disabled={isSubmitting || !content.trim()}
                  className="flex-1"
                  onClick={() => {
                    setWaitForProcessing(true);
                    handleSubmit(new Event('submit') as any);
                  }}
                >
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Upload and Process
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <Card className="bg-[#1E2D3D] border-[#1E2D3D]">
                  <CardHeader>
                    <CardTitle>Processed Ticket</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div>
                      <span className="font-semibold">Title:</span> {processedTicket.title}
                    </div>
                    <div>
                      <span className="font-semibold">Priority:</span>{' '}
                      <Badge variant="outline">{processedTicket.priority}</Badge>
                    </div>
                    <div>
                      <span className="font-semibold">Tags:</span>{' '}
                      {processedTicket.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="mr-1">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <div>
                      <span className="font-semibold">Description:</span>
                      <p className="mt-1 text-sm">{processedTicket.description}</p>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex justify-end space-x-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setProcessedTicket(null);
                      setContent('');
                    }}
                  >
                    Start Over
                  </Button>
                  <Button
                    type="button"
                    onClick={handleCreateTicket}
                    disabled={createTicket.isLoading}
                  >
                    {createTicket.isLoading && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Create Ticket
                  </Button>
                </div>
              </div>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default MarketplaceDialog;
