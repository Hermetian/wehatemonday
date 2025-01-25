import { useState, FormEvent, ChangeEvent } from 'react';
import { trpc } from '@/app/lib/trpc/client';
import { TicketPriority } from '@/app/types/tickets';
import { useAuth } from '@/app/lib/auth/AuthContext';
import { useRouter } from 'next/navigation';
import { RichTextEditor } from '@/app/components/ui/rich-text-editor';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { Label } from '@/app/components/ui/label';
import { Expand } from 'lucide-react';
import { cn } from '@/app/lib/utils/common';

const PRIORITY_COLORS = {
  [TicketPriority.LOW]: 'bg-blue-100 text-blue-800 border-blue-200',
  [TicketPriority.MEDIUM]: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  [TicketPriority.HIGH]: 'bg-red-100 text-red-800 border-red-200',
  [TicketPriority.URGENT]: 'bg-purple-100 text-purple-800 border-purple-200',
} satisfies { [K in TicketPriority]: string };

const PriorityTag = ({ priority }: { priority: TicketPriority }) => (
  <span className={cn(
    'inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border',
    PRIORITY_COLORS[priority]
  )}>
    {priority}
  </span>
);

export const CreateTicketForm = () => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [descriptionHtml, setDescriptionHtml] = useState('');
  const [priority, setPriority] = useState<TicketPriority>(TicketPriority.MEDIUM);
  const [error, setError] = useState<string | null>(null);
  const [isEditorExpanded, setIsEditorExpanded] = useState(false);
  const { user } = useAuth();
  const router = useRouter();

  const utils = trpc.useContext();
  const createTicket = trpc.ticket.create.useMutation({
    onSuccess: () => {
      utils.ticket.list.invalidate();
      router.push('/homepage');
    },
    onError: (error) => {
      console.error('Failed to create ticket:', error);
      setError(error.message || 'Failed to create ticket. Please try again.');
    },
    onSettled: () => {
      setTitle('');
      setDescription('');
      setDescriptionHtml('');
      setPriority(TicketPriority.MEDIUM);
    },
  });

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    
    if (!user?.id) {
      setError('You must be signed in to create a ticket');
      router.push('/auth/signin');
      return;
    }
    
    try {
      await createTicket.mutateAsync({
        title,
        description,
        descriptionHtml,
        priority,
        customerId: user.id,
        createdBy: user.id
      });
    } catch (error: unknown) {
      console.error('Error creating ticket:', error);
      setError(error instanceof Error ? error.message : 'Failed to create ticket. Please try again.');
    }
  };

  if (!user) {
    return (
      <div className="text-center py-4">
        <p className="text-red-600">Please sign in to create a ticket</p>
        <Button
          onClick={() => router.push('/auth/signin')}
          className="mt-2"
        >
          Sign In
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto bg-white rounded-lg shadow-md">
      <form onSubmit={handleSubmit} className="space-y-6 p-6">
        <div className="space-y-2">
          <Label htmlFor="title" className="text-sm font-medium text-gray-700">Title</Label>
          <Input
            type="text"
            id="title"
            value={title}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
            className="w-full border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 bg-white text-gray-900"
            required
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="description" className="text-sm font-medium text-gray-700">Description</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsEditorExpanded(!isEditorExpanded)}
              className="text-gray-500 hover:text-gray-700"
            >
              <Expand className="h-4 w-4 mr-1" />
              {isEditorExpanded ? 'Collapse' : 'Expand'}
            </Button>
          </div>
          <div 
            className={cn(
              "transition-all duration-200 ease-in-out rounded-lg overflow-hidden bg-white",
              isEditorExpanded ? "h-[500px]" : "h-[200px]"
            )}
          >
            <RichTextEditor
              content={description}
              onChange={(html) => {
                setDescription(html);
                setDescriptionHtml(html);
              }}
              placeholder="Describe your issue..."
              className="h-full bg-white text-gray-900 rounded-lg border border-gray-300"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="priority" className="text-sm font-medium text-gray-700">Priority</Label>
          <Select
            value={priority}
            onValueChange={(value: string) => setPriority(value as TicketPriority)}
          >
            <SelectTrigger className="w-full bg-white border-gray-300 text-gray-900">
              <SelectValue>
                <PriorityTag priority={priority} />
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-white border-gray-300">
              {Object.values(TicketPriority).map((p) => (
                <SelectItem 
                  key={p} 
                  value={p} 
                  className="text-gray-900 focus:bg-gray-100 data-[highlighted]:bg-gray-100"
                >
                  <PriorityTag priority={p} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex justify-between items-center pt-4 border-t border-gray-200">
          <Button
            type="submit"
            disabled={createTicket.isLoading}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {createTicket.isLoading ? 'Creating...' : 'Create Ticket'}
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/homepage')}
            className="border-gray-300 text-gray-700 hover:bg-gray-100 hover:text-gray-900"
          >
            Cancel
          </Button>
        </div>

        {(error || createTicket.error) && (
          <div className="mt-2 p-2 bg-red-50 text-red-700 rounded border border-red-200">
            {error || createTicket.error?.message || 'Failed to create ticket. Please try again.'}
          </div>
        )}
      </form>
    </div>
  );
}; 