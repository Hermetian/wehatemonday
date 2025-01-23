'use client';

import { useEffect } from 'react';
import { useAuth } from '@/app/lib/auth/AuthContext';
import { CreateTicketForm } from '@/app/components/tickets/CreateTicketForm';
import { useRouter } from 'next/navigation';
import { UserRole } from '@prisma/client';
import { ProtectedRoute } from '@/app/components/auth/ProtectedRoute';

export default function CreateTicketPage() {
  const { user, role } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!user) {
      router.push('/auth/signin');
    } 
    else if (role !== UserRole.CUSTOMER && role !== UserRole.AGENT) {
      router.push('/homepage');
    }
  }, [user, role, router]);

  if (!user || (role !== UserRole.CUSTOMER && role !== UserRole.AGENT)) {
    return null;
  }

  return (
    <ProtectedRoute>
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold mb-6">Create New Support Ticket</h1>
          <div className="bg-white rounded-lg shadow-md p-6">
            <CreateTicketForm />
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
} 