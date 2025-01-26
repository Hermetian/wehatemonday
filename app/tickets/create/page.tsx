'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@app/lib/auth/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { CreateTicketForm } from '@/components/tickets/CreateTicketForm';
import { UserClade } from '@/lib/supabase/types';

export default function CreateTicketPage() {
  const { user, clade } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!user) {
      router.push('/auth/signin');
    } 
    else if (clade !== UserClade.CUSTOMER && clade !== UserClade.AGENT) {
      router.push('/homepage');
    }
  }, [user, clade, router]);

  if (!user || (clade !== UserClade.CUSTOMER && clade !== UserClade.AGENT)) {
    return null;
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#0A1A2F] text-white">
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold mb-6">Create New Support Ticket</h1>
            <CreateTicketForm />
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}