import React from 'react';
import { trpc } from '@/app/lib/trpc/client';
import { useAuth } from '@/app/lib/auth/AuthContext';
import { UserRole } from '@prisma/client';
import { Button } from '@/app/components/ui/button';
import { Textarea } from '@/app/components/ui/textarea';
import { Checkbox } from '@/app/components/ui/checkbox';
import { Label } from '@/app/components/ui/label';
import { cn } from '@/app/lib/utils/common';

interface TicketMessagesProps {
  ticketId: string;
}

export const TicketMessages: React.FC<TicketMessagesProps> = ({ ticketId }) => {
  const { role } = useAuth();
  const [content, setContent] = React.useState('');
  const [isInternal, setIsInternal] = React.useState(false);
  const utils = trpc.useContext();

  const { data: messages, isLoading } = trpc.message.list.useQuery({ ticketId });

  const createMessage = trpc.message.create.useMutation({
    onSuccess: () => {
      setContent('');
      setIsInternal(false);
      utils.message.list.invalidate({ ticketId });
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    await createMessage.mutateAsync({
      content: content.trim(),
      ticketId,
      isInternal,
    });
  };

  const isStaff = role === UserRole.ADMIN || role === UserRole.MANAGER || role === UserRole.AGENT;

  return (
    <div className="space-y-6">
      {/* Message List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          </div>
        ) : messages && messages.length > 0 ? (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "p-4 rounded-lg",
                message.isInternal
                  ? "bg-yellow-50 border border-yellow-200"
                  : "bg-white border border-gray-200"
              )}
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-gray-900">{message.content}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(message.createdAt).toLocaleString()}
                    {message.isInternal && (
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
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="message">Add a message</Label>
          <Textarea
            id="message"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Type your message here..."
            className="min-h-[100px]"
          />
        </div>

        {isStaff && (
          <div className="flex items-center space-x-2">
            <Checkbox
              id="internal"
              checked={isInternal}
              onCheckedChange={(checked) => setIsInternal(checked as boolean)}
            />
            <Label htmlFor="internal" className="text-sm font-normal">
              Mark as internal note
            </Label>
          </div>
        )}

        <Button
          type="submit"
          disabled={createMessage.isLoading || !content.trim()}
          className="w-full"
        >
          {createMessage.isLoading ? "Sending..." : "Send Message"}
        </Button>
      </form>
    </div>
  );
}; 