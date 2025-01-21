import React, { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import TicketList from '../components/TicketList';
import Terminal from '../components/Terminal';
import { useRouter } from 'next/router';
import { UserRole } from '@prisma/client';
import { UserSettings } from '../components/UserSettings';

const RedirectIfNotAuthenticated = () => {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!user) {
      router.push('/auth/signin');
    }
  }, [user, router]);

  return null;
};

const Homepage = () => {
  const { user, role } = useAuth();
  const router = useRouter();

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <UserSettings />
      </div>
      <RedirectIfNotAuthenticated />
      {role === UserRole.ADMIN && <Terminal />}
      {(role === UserRole.ADMIN || role === UserRole.AGENT) && <TicketList />}
      {role === UserRole.CUSTOMER && <TicketList filterByUser={user?.id} />}
      {(role === UserRole.CUSTOMER || role === UserRole.AGENT) && (
        <button
          onClick={() => router.push('/tickets/create')}
          className="mt-4 bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600 transition-colors"
        >
          Create New Ticket
        </button>
      )}
    </div>
  );
};

export default Homepage; 