"use client";
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/lib/auth/AuthContext';
import { Role } from '@/app/types/auth';
//import Image from "next/image";

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      if (user) {
        console.log('Root page: User authenticated', {
          email: user.email,
          role: user.role as Role,
          provider: user.app_metadata?.provider
        });
        console.log('Root page: Redirecting to homepage...');
        router.replace('/homepage/');
      } else {
        console.log('Root page: No user, redirecting to signin');
        router.replace('/auth/signin');
      }
    }
  }, [user, loading, router]);

  // Show loading state while checking auth
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
        <p className="mt-2 text-sm text-gray-600">Checking authentication...</p>
      </div>
    </div>
  );
}
