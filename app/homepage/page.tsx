'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/lib/auth/AuthContext';
import { TicketList } from '@/app/components/tickets/TicketList';
import Terminal from '@/app/components/common/Terminal';
import { UserSettings } from '@/app/components/auth/UserSettings';
import { TeamManagement } from '@/app/components/teams/TeamManagement';
import { trpc } from '@/app/lib/trpc/client';
import { Role } from '@/app/types/auth';
import { MarketplaceDialog } from '@/app/components/marketplace/MarketplaceDialog';

const TestComponent = () => {
  const { data: simpleData, error: simpleError } = trpc.team.simpleTest.useQuery();
  const { data: userData, error: userError, isLoading } = trpc.team.testUsers.useQuery();

  if (isLoading) return <div>Testing connection...</div>;
  
  return (
    <div className="space-y-4">
      {/* Simple Test Result */}
      <div className="p-4 bg-gray-800 rounded-lg">
        <h3 className="text-lg font-semibold mb-2">Simple Test</h3>
        {simpleError ? (
          <div className="text-red-300">Simple Test Error: {simpleError.message}</div>
        ) : (
          <pre className="text-sm overflow-auto">
            {JSON.stringify(simpleData, null, 2)}
          </pre>
        )}
      </div>

      {/* User Test Result */}
      <div className="p-4 bg-gray-800 rounded-lg">
        <h3 className="text-lg font-semibold mb-2">User Test</h3>
        {userError ? (
          <div className="text-red-300">
            <p>Message: {userError.message}</p>
            {userError.data?.code && (
              <p>Code: {userError.data.code}</p>
            )}
            {userError.shape?.data?.httpStatus && (
              <p>HTTP Status: {userError.shape.data.httpStatus}</p>
            )}
          </div>
        ) : (
          <pre className="text-sm overflow-auto">
            {JSON.stringify({
              success: userData?.success,
              userCount: userData?.users?.length,
              currentRole: userData?.currentUserRole,
              debug: userData?.debug
            }, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
};

const Homepage = () => {
  const router = useRouter();
  const { user, role, loading } = useAuth();
  const [isInitialized, setIsInitialized] = useState(false);
  const [isMarketplaceDialogOpen, setIsMarketplaceDialogOpen] = useState(false);

  useEffect(() => {
    console.log('Homepage: Checking authentication...');
    console.log('Homepage: Auth state:', {
      loading,
      userPresent: !!user,
      userEmail: user?.email,
      userRole: role,
      sessionRole: role
    });

    // Only redirect if we're sure about the authentication state
    if (!loading) {
      setIsInitialized(true);
      if (!user) {
        console.log('Homepage: No user found, redirecting to signin');
        router.replace('/auth/signin');
      } else {
        console.log('Homepage: User authenticated, rendering dashboard');
      }
    }
  }, [user, loading, router, role]);

  // Show loading state while checking auth or waiting for initialization
  if (loading || !isInitialized) {
    console.log('Homepage: Showing loading state');
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto"></div>
          <p className="mt-2 text-sm text-gray-300">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  // If we're initialized but have no user, render nothing while redirect happens
  if (!user) {
    console.log('Homepage: No user, rendering empty state');
    return null;
  }

  console.log('Homepage: Rendering dashboard for user:', {
    email: user.email,
    role: role as Role,
    sessionRole: role as Role
  });

  const isStaff = (role as Role) === 'MANAGER' || (role as Role) === 'ADMIN' || (role as Role) === 'AGENT';
  const canCreateTickets = (role as Role) === 'CUSTOMER' || (role as Role) === 'AGENT' || (role as Role) === 'MANAGER'

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {(role as Role) === 'ADMIN' && (
          <TestComponent />
        )}

        {/* Header */}
        <div className="flex justify-between items-center mb-8 bg-gray-800 p-4 rounded-lg">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <div className="flex items-center gap-4">
            <UserSettings />
          </div>
        </div>

        {/* Admin Console */}
        {(role as Role) === 'ADMIN' && (
          <div className="mb-8 bg-gray-800 p-6 rounded-lg">
            <h2 className="text-xl font-semibold mb-4">Admin Console</h2>
            <Terminal userRole={role as Role} />
          </div>
        )}

        {/* Team Management Section - Show for all roles except CUSTOMER */}
        {isStaff && (
          <div className="mb-8 bg-gray-800 p-6 rounded-lg">
            <TeamManagement />
          </div>
        )}

        {/* Tickets Section */}
        <div className="mb-8 bg-gray-800 p-6 rounded-lg">
          <div className="flex justify-end items-center mb-4">
            <div className="flex items-center space-x-2">
              {role && ['ADMIN', 'MANAGER', 'AGENT'].includes(role) && (
                <button
                  onClick={() => setIsMarketplaceDialogOpen(true)}
                  className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-md transition-colors"
                >
                  Upload Marketplace Conversation
                </button>
              )}
              {canCreateTickets && (
                <button
                  onClick={() => router.push('/tickets/create')}
                  className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-md transition-colors"
                >
                  Create New Ticket
                </button>
              )}
            </div>
          </div>
          
          {/* Ticket List */}
          {((role as Role) === 'ADMIN' || (role as Role) === 'MANAGER' || (role as Role) === 'AGENT') && <TicketList />}
          {(role as Role) === 'CUSTOMER' && <TicketList filterByUser={user?.id} />}

          <MarketplaceDialog
            open={isMarketplaceDialogOpen}
            onOpenChange={setIsMarketplaceDialogOpen}
          />
        </div>
      </div>
    </div>
  );
}

export default Homepage; 