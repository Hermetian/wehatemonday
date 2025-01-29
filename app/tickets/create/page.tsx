'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/lib/auth/AuthContext';
import { trpc } from '@/app/lib/trpc/client';
import { TicketPriority } from '@/app/types/tickets';
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
import { RichTextEditor } from '@/app/components/ui/rich-text-editor';
import { Loader2 } from 'lucide-react';

export default function CreateTicket() {
  const router = useRouter();
  const { user } = useAuth();
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [description_html, setDescriptionHtml] = React.useState('');
  const [priority, setPriority] = React.useState<TicketPriority>(TicketPriority.MEDIUM);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Redirect if not logged in
  React.useEffect(() => {
    if (!user) {
      router.replace('/auth/signin');
    }
  }, [user, router]);

  const createTicket = trpc.ticket.create.useMutation({
    onSuccess: () => {
      router.push('/');
    },
    onError: (error) => {
      console.error('Failed to create ticket:', error);
      setIsSubmitting(false);
    },
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;

    setIsSubmitting(true);
    
    try {
      await createTicket.mutateAsync({
        title: title.trim(),
        description,
        description_html,
        priority,
        customer_id: user.id,
        created_by_id: user.id,
      });
    } catch (error) {
      console.error('Error creating ticket:', error);
      setIsSubmitting(false);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-900 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="bg-gray-800 shadow rounded-lg p-6 space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-white">Create New Ticket</h2>
            <p className="mt-1 text-sm text-gray-300">
              Please provide the details for your support request.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Title */}
            <div>
              <Label htmlFor="title" className="text-white">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Brief summary of your issue"
                required
                className="mt-1 bg-gray-700 border-gray-600 text-white placeholder-gray-400"
              />
            </div>

            {/* Description */}
            <div>
              <Label htmlFor="description" className="text-white">Description</Label>
              <div className="mt-1">
                <RichTextEditor
                  content={description}
                  onChange={(html) => {
                    setDescription(html);
                    setDescriptionHtml(html);
                  }}
                  placeholder="Detailed description of your issue..."
                  className="min-h-[200px] bg-white border-gray-200 text-gray-900 [&_.tiptap]:text-gray-900 [&_select]:text-gray-900"
                />
              </div>
            </div>

            {/* Priority */}
            <div>
              <Label htmlFor="priority" className="text-white">Priority</Label>
              <Select
                value={priority}
                onValueChange={(value: TicketPriority) => setPriority(value)}
              >
                <SelectTrigger className="mt-1 bg-gray-700 border-gray-600 text-white">
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent className="bg-gray-700 border-gray-600">
                  {Object.values(TicketPriority).map((p) => (
                    <SelectItem
                      key={p}
                      value={p}
                      className="text-white hover:bg-gray-600"
                    >
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/')}
                className="border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !title.trim() || !description.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isSubmitting ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating...
                  </div>
                ) : (
                  'Create Ticket'
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
} 