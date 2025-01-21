import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Cog, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { trpc } from '../utils/trpc';
import type { TRPCClientErrorLike } from '@trpc/client';
import type { AppRouter } from '../server/routers/_app';
import { useRouter } from 'next/router';

type FormEvent = React.FormEvent<HTMLFormElement>;
type InputEvent = React.ChangeEvent<HTMLInputElement>;

export function UserSettings() {
  const router = useRouter();
  const { user, refreshSession, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(user?.user_metadata?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const updateProfile = trpc.user.updateProfile.useMutation({
    onError: (error: TRPCClientErrorLike<AppRouter>) => {
      toast.error(`Failed to update profile in database: ${error.message}`);
      setIsLoading(false);
    },
    onSuccess: () => {
      setIsLoading(false);
    }
  });

  const handleUpdateProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setIsLoading(true);
    
    try {
      let hasChanges = false;

      // Verify current password if trying to change password or email
      if ((newPassword || email !== user?.email) && currentPassword) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: user?.email || '',
          password: currentPassword,
        });

        if (signInError) {
          toast.error('Current password is incorrect');
          setIsLoading(false);
          return;
        }
      }

      // Update name if changed
      if (name !== user?.user_metadata?.name) {
        hasChanges = true;
        try {
          //update database first
          await updateProfile.mutateAsync({ name });
          //then update Supabase user metadata
          const { error: updateError } = await supabase.auth.updateUser({
            data: { name }
          });
          
          if (updateError) throw updateError;

        } catch (error: any) {
          console.error('Name update error:', error);
          toast.error('Failed to update name');
          setIsLoading(false);
          return;
        }
      }

      // Update email if changed
      if (email !== user?.email) {
        if (!currentPassword) {
          toast.error('Please enter your current password to change email');
          setIsLoading(false);
          return;
        }

        hasChanges = true;
        const { error: emailError } = await supabase.auth.updateUser({
          email: email
        });
        
        if (emailError) {
          toast.error(`Failed to update email: ${emailError.message}`);
          setIsLoading(false);
          return;
        }
        
        // Update database after successful Supabase update
        await updateProfile.mutateAsync({ email });
        toast.success('Email update confirmation sent. Please check your inbox.');
      }

      // Update password if provided
      if (newPassword && currentPassword) {
        hasChanges = true;
        const { error: passwordError } = await supabase.auth.updateUser({
          password: newPassword
        });

        if (passwordError) {
          toast.error(`Failed to update password: ${passwordError.message}`);
          setIsLoading(false);
          return;
        }
        
        toast.success('Password updated successfully');
        setCurrentPassword('');
        setNewPassword('');
      }

      if (hasChanges) {
        // Refresh the session to get updated user data
        await refreshSession();
        toast.success('Profile updated successfully');
      }

      setIsLoading(false);
    } catch (error: any) {
      console.error('Profile update error:', error);
      toast.error(error.message || 'Failed to update profile');
      
      // Reset form with original values
      setName(user?.user_metadata?.name || '');
      setEmail(user?.email || '');
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      setOpen(false); // Close the dialog first
      await signOut();
      // Add a small delay to ensure auth state is cleared
      setTimeout(() => {
        router.push('/auth/signin');
      }, 100);
    } catch (_error) {
      toast.error('Failed to sign out');
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="ghost" size="icon">
          <Cog className="h-5 w-5" />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Content className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[425px] bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg">
          <Dialog.Title className="text-lg font-semibold mb-4">Settings</Dialog.Title>
          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e: InputEvent) => setName(e.target.value)}
                placeholder="Your name"
                disabled={isLoading}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e: InputEvent) => setEmail(e.target.value)}
                placeholder="your.email@example.com"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current Password</Label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e: InputEvent) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                disabled={isLoading}
                required={email !== user?.email || newPassword !== ''}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e: InputEvent) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                disabled={isLoading}
              />
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Updating...' : 'Update Profile'}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <Button
              variant="destructive"
              className="w-full"
              onClick={handleSignOut}
              disabled={isLoading}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>

          <Dialog.Close asChild>
            <button
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              aria-label="Close"
              disabled={isLoading}
            >
              ✕
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
} 