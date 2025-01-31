import React from 'react';
import { trpc } from '@/app/lib/trpc/client';
import { useAuth } from '@/app/lib/auth/AuthContext';
import { RichTextEditor, RichTextContent } from '@/app/components/ui/rich-text-editor';
import { Button } from '@/app/components/ui/button';
import { Loader2 } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/app/components/ui/tooltip";
import { Checkbox } from '@/app/components/ui/checkbox';
import { Label } from '@/app/components/ui/label';
import { cn } from '@/app/lib/utils/common';
import { inferRouterInputs } from '@trpc/server';
import type { AppRouter } from '@/app/lib/trpc/routers/_app';

type MessageInput = inferRouterInputs<AppRouter>['message']['create'];
//type Message = NonNullable<inferRouterOutputs<AppRouter>['message']['list']>[number];

interface TicketMessagesProps {
  ticket_id: string;
  tags?: string[];
}

export const TicketMessages: React.FC<TicketMessagesProps> = ({ ticket_id, tags = [] }) => {
  const { role } = useAuth();
  const [content, setContent] = React.useState('');
  const [content_html, setContentHtml] = React.useState('');
  const [is_internal, setIsInternal] = React.useState(false);
  const [isLoadingSuggestion, setIsLoadingSuggestion] = React.useState(false);
  const utils = trpc.useContext();
  const dialogRef = React.useRef<HTMLDivElement | null>(null);

  const { data: messages, isLoading } = trpc.message.list.useQuery({ ticket_id });

  const createMessage = trpc.message.create.useMutation({
    onSuccess: () => {
      setContent('');
      setContentHtml('');
      setIsInternal(false);
      utils.message.list.invalidate();
    },
  });

  const getSuggestion = trpc.message.getSuggestion.useMutation({
    onSuccess: (suggestion) => {
      // Check if we're in a dialog by looking for closest dialog element
      const isInDialog = !!dialogRef.current?.closest('[role="dialog"]');
      
      // Format the suggestion for HTML display
      const suggestionHtml = suggestion
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => `<p>${line}</p>`)
        .join('');
      
      if (isInDialog) {
        // For RichTextEditor, we need to set the HTML content
        setContent(suggestionHtml);
        setContentHtml(suggestionHtml);
      } else {
        // Create a new message and clear the input
        createMessage.mutate({
          content: suggestion,
          content_html: suggestionHtml,
          ticket_id,
          is_internal: false
        });
      }
      utils.message.list.invalidate();
    },
    onSettled: () => {
      setIsLoadingSuggestion(false);
    }
  });

  const handleGetSuggestion = async () => {
    setIsLoadingSuggestion(true);
    const isInDialog = !!dialogRef.current?.closest('[role="dialog"]');
    await getSuggestion.mutateAsync({ 
      ticket_id,
      should_create_message: !isInDialog // Only create internal message if not in dialog
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    const messageInput: MessageInput = {
      content: content.trim(),
      content_html,
      ticket_id,
      is_internal,
    };

    await createMessage.mutateAsync(messageInput);
  };

  const isStaff = role === 'ADMIN' || role === 'MANAGER' || role === 'AGENT';
  const isMarketplace = tags.includes('Marketplace');

  return (
    <div className="space-y-6" ref={dialogRef}>
      {/* Message List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-gray-900" />
          </div>
        ) : messages && messages.length > 0 ? (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "p-4 rounded-lg",
                message.is_internal
                  ? "bg-yellow-50 border border-yellow-200"
                  : "bg-white border border-gray-200"
              )}
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <RichTextContent content={message.content_html || message.content} />
                  <p className="text-xs text-gray-500">
                    {new Date(message.created_at).toLocaleString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                    {message.is_internal && (
                      <span className="ml-2 text-yellow-600 font-medium">
                        Internal Note
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          ))
        ) : (
          <p className="text-center text-gray-500">No messages yet</p>
        )}
      </div>

      {/* Message Form */}
      <form onSubmit={handleSubmit} className="space-y-4 bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="message" className="text-sm font-medium text-gray-700">
              Add a message
            </Label>
            {isStaff && isMarketplace && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleGetSuggestion}
                disabled={isLoadingSuggestion}
                className="text-blue-600 hover:text-blue-700 border-blue-200 hover:bg-blue-50"
              >
                {isLoadingSuggestion ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Get Suggestion'
                )}
              </Button>
            )}
          </div>
          <RichTextEditor
            content={content}
            onChange={(html) => {
              setContent(html);
              setContentHtml(html);
            }}
            placeholder="Type your message here..."
            className="min-h-[100px]"
          />
        </div>

        {isStaff && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center space-x-2 bg-yellow-50 px-3 py-1.5 rounded-md w-fit hover:bg-yellow-100 transition-colors">
                  <Checkbox
                    id="internal"
                    checked={is_internal}
                    onCheckedChange={(checked) => setIsInternal(checked as boolean)}
                    className="border-yellow-500 data-[state=checked]:bg-yellow-600 data-[state=checked]:border-yellow-600"
                  />
                  <Label htmlFor="internal" className="text-sm font-medium text-yellow-800 cursor-pointer">
                    Mark as internal note
                  </Label>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-sm">Only visible to staff members</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        <div className="pt-2">
          <Button
            type="submit"
            disabled={createMessage.isLoading || !content.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 transition-colors"
          >
            {createMessage.isLoading ? (
              <span className="flex items-center justify-center space-x-2">
                <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                <span>Sending...</span>
              </span>
            ) : (
              "Send Message"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}; 