'use client';

import React, { Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/lib/auth/AuthContext';
import { UserClade } from '@/lib/supabase/types';
import { TicketList } from '@/app/components/tickets/TicketList';
import Terminal from '@/app/components/common/Terminal';
import { UserSettings } from '@/app/components/auth/UserSettings';
import { TeamManagement } from '@/app/components/teams/TeamManagement';
import { Skeleton } from '@/app/components/ui/skeleton';
import { Button } from '@/app/components/ui/button';
import Link from 'next/link';

const Homepage = () => {
  const router = useRouter();
  const { user, clade } = useAuth();

  useEffect(() => {
    if (!user) {
      router.push('/auth/signin');
    }
  }, [user, router]);

  if (!user) {
    return null;
  }

  const isManager = clade === UserClade.MANAGER || clade === UserClade.ADMIN;
  const canCreateTickets = clade === UserClade.CUSTOMER || clade === UserClade.AGENT || clade === UserClade.MANAGER;

  // For debugging
  console.log('Current user:', user);
  console.log('Current clade:', clade);

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
        {clade === UserClade.ADMIN && (
          <div className="mb-8 bg-gray-800 p-6 rounded-lg">
            <h2 className="text-xl font-semibold mb-4">Admin Console</h2>
            <Terminal userClade={clade} />
          </div>
        )}

        {/* Team Management Section */}
        {isManager && (
          <div className="mb-8 bg-gray-800 p-6 rounded-lg">
            <h2 className="text-xl font-semibold mb-4">Team Management</h2>
            <TeamManagement />
          </div>
        )}

        {/* Tickets Section */}
        <div className="mb-8 bg-gray-800 p-6 rounded-lg">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">
              {clade === UserClade.CUSTOMER ? 'Your Tickets' : 'All Tickets'}
            </h2>
            {canCreateTickets && (
              <Link href="/tickets/create" passHref>
                <Button>Create Ticket</Button>
              </Link>
            )}
          </div>
          
          {/* Ticket List */}
          <Suspense fallback={<Skeleton className="h-48 w-full" />}>
            {(clade === UserClade.ADMIN || clade === UserClade.MANAGER || clade === UserClade.AGENT) && <TicketList />}
            {clade === UserClade.CUSTOMER && <TicketList filterByUser={user?.id} />}
          </Suspense>
        </div>
      </div>
    </div>
  );
};

export default Homepage; 