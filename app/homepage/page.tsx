'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/lib/auth/AuthContext';
import { TicketList } from '@/app/components/tickets/TicketList';
import Terminal from '@/app/components/common/Terminal';
import { UserRole } from '@prisma/client';
import { UserSettings } from '@/app/components/auth/UserSettings';

const Homepage = () => {
  const router = useRouter();
  const { user, role } = useAuth();

  useEffect(() => {
    if (!user) {
      router.push('/auth/signin');
    }
  }, [user, router]);

  if (!user) {
    return null;
  }

  // For debugging
  console.log('Current user:', user);
  console.log('Current role:', role);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8 bg-gray-800 p-4 rounded-lg">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <div className="flex items-center gap-4">
            <UserSettings />
          </div>
        </div>

        {/* Admin Console */}
        {role === UserRole.ADMIN && (
          <div className="mb-8 bg-gray-800 p-6 rounded-lg">
            <h2 className="text-xl font-semibold mb-4">Admin Console</h2>
            <Terminal userRole={role} />
          </div>
        )}

        {/* Tickets Section */}
        <div className="mb-8 bg-gray-800 p-6 rounded-lg">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">
              {role === UserRole.CUSTOMER ? 'Your Tickets' : 'All Tickets'}
            </h2>
            {(role === UserRole.CUSTOMER || role === UserRole.AGENT) && (
              <button
                onClick={() => router.push('/tickets/create')}
                className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-md transition-colors"
              >
                Create New Ticket
              </button>
            )}
          </div>
          
          {/* Ticket List */}
          {(role === UserRole.ADMIN || role === UserRole.MANAGER || role === UserRole.AGENT) && <TicketList />}
          {role === UserRole.CUSTOMER && <TicketList filterByUser={user?.id} />}
        </div>
      </div>
    </div>
  );
};

export default Homepage; 