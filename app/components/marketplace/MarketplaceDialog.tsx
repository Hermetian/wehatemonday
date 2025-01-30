import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { trpc } from '@/app/lib/trpc/client';
import { Alert, AlertTitle, AlertDescription } from '../ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Loader2 } from 'lucide-react';

interface MarketplaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const MarketplaceDialog: React.FC<MarketplaceDialogProps> = ({
  open,
  onOpenChange,
}) => {
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

  const createMarketplace = trpc.marketplace.create.useMutation({
    onSuccess: (data) => {
      setAlert({ type: 'success', message: 'Marketplace conversation uploaded successfully' });
      setContent('');
      processConversation.mutate({ id: data.id });
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
    // TODO: Implement ticket creation from processed data
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0A1A2F] border-[#1E2D3D]">
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

            {processedTicket && (
              <Card className="bg-[#1E2D3D] border-[#1E2D3D]">
                <CardHeader>
                  <CardTitle className="text-foreground">Processed Ticket</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div>
                    <span className="font-semibold text-foreground">Title:</span>
                    <p className="text-muted-foreground">{processedTicket.title}</p>
                  </div>
                  <div>
                    <span className="font-semibold text-foreground">Description:</span>
                    <p className="text-muted-foreground whitespace-pre-wrap">{processedTicket.description}</p>
                  </div>
                  <div>
                    <span className="font-semibold text-foreground">Priority:</span>
                    <Badge variant="outline" className="ml-2 bg-[#1E2D3D] border-[#1E2D3D] text-foreground">{processedTicket.priority}</Badge>
                  </div>
                  <div>
                    <span className="font-semibold text-foreground">Tags:</span>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {processedTicket.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="bg-[#1E2D3D] text-foreground">{tag}</Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
              className="bg-[#1E2D3D] hover:bg-[#2E3D4D]"
            >
              Cancel
            </Button>
            {processedTicket ? (
              <Button
                type="button"
                onClick={handleCreateTicket}
                disabled={isSubmitting || isProcessing}
                className="bg-blue-600 text-white hover:bg-blue-700"
              >
                Create Ticket
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={isSubmitting || isProcessing || !content.trim()}
                className="bg-blue-600 text-white hover:bg-blue-700"
              >
                {isSubmitting || isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {isSubmitting ? 'Uploading...' : 'Processing...'}
                  </>
                ) : (
                  'Upload'
                )}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default MarketplaceDialog;
