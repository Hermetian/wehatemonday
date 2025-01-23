import React, { useState } from 'react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/app/components/ui/dialog';
import { Cog, LogOut } from 'lucide-react';
import { useAuth } from '@/app/lib/auth/AuthContext';
import { supabase } from '@/app/lib/auth/supabase';
import { toast } from 'sonner';
import { trpc } from '@/app/lib/trpc/client';
import type { TRPCClientErrorLike } from '@trpc/client';
import type { AppRouter } from '@/app/lib/trpc/routers/_app';
import { useRouter } from 'next/navigation';

export function UserSettings() {
  const router = useRouter();
  const { user, refreshSession, signOut } = useAuth();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLogoutOpen, setIsLogoutOpen] = useState(false);
  const [name, setName] = useState(user?.user_metadata?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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

  const handleUpdateProfile = async () => {
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
        if (newPassword !== confirmPassword) {
          toast.error('Passwords do not match');
          setIsLoading(false);
          return;
        }

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
        setConfirmPassword('');
      }

      if (hasChanges) {
        // Refresh the session to get updated user data
        await refreshSession();
        toast.success('Profile updated successfully');
        setIsSettingsOpen(false);
      }

      setIsLoading(false);
    } catch (error: unknown) {
      console.error('Profile update error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update profile');
      
      // Reset form with original values
      setName(user?.user_metadata?.name || '');
      setEmail(user?.email || '');
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      setIsLogoutOpen(false); // Close the dialog first
      await signOut(); // Wait for sign out to complete
      router.replace('/auth/signin'); // Use replace instead of push to prevent back navigation
      router.refresh(); // Force a router refresh to ensure clean state
    } catch (error) {
      console.error('Error signing out:', error);
      toast.error('Failed to sign out');
    }
  };

  const handlePasswordChange = async () => {
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      toast.success('Password updated successfully');
      setIsSettingsOpen(false);
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      console.error('Error updating password:', error);
      toast.error('Failed to update password');
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon">
            <Cog className="h-5 w-5" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Account Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Display Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                value={user?.email || ''}
                disabled
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="current-password">Current Password</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsSettingsOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpdateProfile}>
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={isLogoutOpen} onOpenChange={setIsLogoutOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" title="Sign Out">
            <LogOut className="h-5 w-5" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign Out</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p>Are you sure you want to sign out?</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsLogoutOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleSignOut}>
                Sign Out
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
} 