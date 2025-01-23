import { useState, FormEvent } from 'react';
import { trpc } from '@/app/lib/trpc/client';
import { TicketPriority } from '@/app/types/tickets';
import { useAuth } from '@/app/lib/auth/AuthContext';
import { useRouter } from 'next/navigation';

export const CreateTicketForm = () => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TicketPriority>(TicketPriority.MEDIUM);
  const [error, setError] = useState<string | null>(null);
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
        priority,
        customerId: user.id,
        createdBy: user.id
      });
    } catch (error: any) {
      console.error('Error creating ticket:', error);
      setError(error.message || 'Failed to create ticket. Please try again.');
    }
  };

  if (!user) {
    return (
      <div className="text-center py-4">
        <p className="text-red-600">Please sign in to create a ticket</p>
        <button
          onClick={() => router.push('/auth/signin')}
          className="mt-2 inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          Sign In
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="title" className="block text-sm font-medium text-gray-900">
          Title
        </label>
        <input
          type="text"
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-gray-900"
          required
        />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-900">
          Description
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-gray-900"
          rows={3}
          required
        />
      </div>

      <div>
        <label htmlFor="priority" className="block text-sm font-medium text-gray-900">
          Priority
        </label>
        <select
          id="priority"
          value={priority}
          onChange={(e) => setPriority(e.target.value as TicketPriority)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-gray-900"
        >
          {Object.values(TicketPriority).map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <div className="flex justify-between items-center">
        <button
          type="submit"
          className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
          disabled={createTicket.isLoading}
        >
          {createTicket.isLoading ? 'Creating...' : 'Create Ticket'}
        </button>

        <button
          type="button"
          onClick={() => router.push('/homepage')}
          className="text-sm text-gray-600 hover:text-gray-900"
        >
          Cancel
        </button>
      </div>

      {(error || createTicket.error) && (
        <div className="mt-2 p-2 bg-red-100 border border-red-400 text-red-700 rounded">
          {error || createTicket.error?.message || 'Failed to create ticket. Please try again.'}
        </div>
      )}
    </form>
  );
}; 