import { useState, useEffect } from 'react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/app/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";
import { Cog, LogOut, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '@/app/lib/auth/AuthContext';
import { supabase } from '@/app/lib/auth/supabase';
import { toast } from 'sonner';
import { trpc } from '@/app/lib/trpc/client';
import type { TRPCClientErrorLike } from '@trpc/client';
import type { AppRouter } from '@/app/lib/trpc/routers/_app';
import { useRouter } from 'next/navigation';
import { Role, VALID_ROLES } from '@/app/types/auth';
import { StatusBadge } from '@/app/components/ui/status-badge';

export function UserSettings() {
  const router = useRouter();
  const { user, role, refreshSession, signOut } = useAuth();
  
  // Get user profile from Prisma
  const { data: userProfile } = trpc.user.getProfile.useQuery(undefined, {
    enabled: !!user,
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLogoutOpen, setIsLogoutOpen] = useState(false);
  const [isPasswordMismatchOpen, setIsPasswordMismatchOpen] = useState(false);
  const [isCurrentPasswordIncorrect, setIsCurrentPasswordIncorrect] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [currentRole, setCurrentRole] = useState<Role>('CUSTOMER');
  const [pendingRole, setPendingRole] = useState<Role>('CUSTOMER');
  const [currentPassword, setCurrentPassword] = useState('');
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasEmailChanged, setHasEmailChanged] = useState(false);

  // Reset states when dialog opens/closes
  useEffect(() => {
    if (!isSettingsOpen) {
      setShowPasswordChange(false);
      setHasEmailChanged(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setPendingRole(currentRole);
    }
  }, [isSettingsOpen, currentRole]);

  // Track email changes
  useEffect(() => {
    setHasEmailChanged(email !== user?.email);
  }, [email, user?.email]);

  // Update initial values when data changes
  useEffect(() => {
    if (user && userProfile) {
      setName(userProfile.name || ''); // Use Prisma data for name
      setEmail(user.email || ''); // Use Supabase data for email
    }
  }, [user, userProfile]);

  // Update role when auth context role changes
  useEffect(() => {
    if (role) {
      setCurrentRole(role);
      setPendingRole(role);
    }
  }, [role]);

  const updateProfile = trpc.user.updateProfile.useMutation({
    onError: (error: TRPCClientErrorLike<AppRouter>) => {
      toast.error(`Failed to update profile in database: ${error.message}`);
      setIsLoading(false);
    },
    onSuccess: () => {
      setIsLoading(false);
    }
  });

  const updateRole = trpc.user.updateRole.useMutation({
    onError: (error: TRPCClientErrorLike<AppRouter>) => {
      toast.error(`Failed to update role: ${error.message}`);
      setIsLoading(false);
    },
    onSuccess: () => {
      setIsLoading(false);
      refreshSession();
    }
  });

  const handleUpdateProfile = async () => {
    if (isLoading) return;
    setIsLoading(true);
    
    try {
      let hasChanges = false;
      const needsPasswordVerification = hasEmailChanged || (showPasswordChange && newPassword);

      // Validate new passwords match if changing password
      if (showPasswordChange && newPassword) {
        if (newPassword !== confirmNewPassword) {
          setIsPasswordMismatchOpen(true);
          setIsLoading(false);
          return;
        }
      }

      // Verify current password if needed
      if (needsPasswordVerification) {
        if (!currentPassword) {
          toast.error('Please enter your current password to make these changes');
          setIsLoading(false);
          return;
        }

        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: user?.email || '',
          password: currentPassword,
        });

        if (signInError) {
          setIsCurrentPasswordIncorrect(true);
          setIsLoading(false);
          return;
        }
      }

      // Update password first if provided (Supabase only)
      if (showPasswordChange && newPassword) {
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
      }

      // Update name if changed (Prisma only)
      if (name !== userProfile?.name) {
        hasChanges = true;
        try {
          await updateProfile.mutateAsync({ name });
        } catch (error: unknown) {
          console.error('Name update error:', error);
          toast.error('Failed to update name');
          setIsLoading(false);
          return;
        }
      }

      // Update role if changed (Prisma only)
      if (pendingRole !== currentRole) {
        hasChanges = true;
        try {
          await updateRole.mutateAsync({ role: pendingRole });
          setCurrentRole(pendingRole);
        } catch (error: unknown) {
          console.error('Role update error:', error);
          toast.error('Failed to update role');
          setIsLoading(false);
          return;
        }
      }

      // Update email if changed (Supabase first, then Prisma)
      if (hasEmailChanged) {
        hasChanges = true;
        const { error: emailError } = await supabase.auth.updateUser({
          email: email
        });
        
        if (emailError) {
          toast.error(`Failed to update email: ${emailError.message}`);
          setIsLoading(false);
          return;
        }
        
        // Update Prisma after successful Supabase update
        await updateProfile.mutateAsync({ email });
        toast.success('Email update confirmation sent. Please check your inbox.');
      }

      if (hasChanges) {
        // Close dialog before refreshing to prevent UI glitches
        setIsSettingsOpen(false);
        setIsLoading(false);
        
        // Refresh the session to get updated user data
        await refreshSession();
        
        // Show success message
        toast.success('Profile updated successfully');

        // If password was changed, sign out and redirect to sign in
        if (showPasswordChange && newPassword) {
          await signOut();
          router.replace('/auth/signin');
          return;
        }
        
        // For other changes, force a complete page reload
        window.location.href = window.location.href;
      } else {
        setIsSettingsOpen(false);
        setIsLoading(false);
      }
    } catch (error: unknown) {
      console.error('Profile update error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update profile');
      
      // Reset form with original values
      if (userProfile) {
        setName(userProfile.name || '');
      }
      if (user) {
        setEmail(user.email || '');
      }
      setPendingRole(currentRole);
      setShowPasswordChange(false);
      setNewPassword('');
      setConfirmNewPassword('');
      setCurrentPassword('');
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      setIsLogoutOpen(false); // Close the dialog first
      await signOut(); // Wait for sign out to complete
      router.replace('/auth/signin?signedOut=true'); // Add signedOut parameter
      router.refresh(); // Force a router refresh to ensure clean state
    } catch (error) {
      console.error('Error signing out:', error);
      toast.error('Failed to sign out');
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon">
            <Cog className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent className="bg-[#0A1A2F] border-[#1E2D3D]">
          <DialogHeader>
            <DialogTitle className="text-foreground">Account Settings</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Make changes to your account settings here.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleUpdateProfile(); }} autoComplete="off">
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-foreground">Display Name</Label>
                <Input
                  id="name"
                  name="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your display name"
                  autoComplete="off"
                  className="bg-[#1E2D3D] border-[#1E2D3D] text-foreground placeholder:text-muted-foreground"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-foreground">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Your email address"
                  autoComplete="off"
                  className="bg-[#1E2D3D] border-[#1E2D3D] text-foreground placeholder:text-muted-foreground"
                />
                {hasEmailChanged && (
                  <p className="text-sm text-muted-foreground">
                    You&apos;ll need to verify your new email address
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="role" className="text-foreground">Role</Label>
                <Select value={pendingRole} onValueChange={(value: Role) => setPendingRole(value)}>
                  <SelectTrigger className="bg-[#1E2D3D] border-[#1E2D3D] text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1E2D3D] border-[#1E2D3D]">
                    {VALID_ROLES.map((r) => (
                      <SelectItem key={r} value={r} className="text-foreground hover:bg-[#0A1A2F]">
                        <div className="flex items-center gap-2">
                          <StatusBadge role={r} />
                          {r}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full flex justify-between items-center bg-[#1E2D3D] border-[#1E2D3D] text-foreground hover:bg-[#2E3D4D] hover:text-foreground"
                  onClick={() => setShowPasswordChange(!showPasswordChange)}
                >
                  Change Password
                  {showPasswordChange ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
                {showPasswordChange && (
                  <div className="space-y-2 mt-2">
                    <div className="space-y-2">
                      <Label htmlFor="new-password" className="text-foreground">New Password</Label>
                      <Input
                        id="new-password"
                        name="new-password"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Enter new password"
                        autoComplete="new-password"
                        className="bg-[#1E2D3D] border-[#1E2D3D] text-foreground placeholder:text-muted-foreground"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirm-new-password" className="text-foreground">Confirm New Password</Label>
                      <Input
                        id="confirm-new-password"
                        name="confirm-new-password"
                        type="password"
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        placeholder="Confirm new password"
                        autoComplete="new-password"
                        className="bg-[#1E2D3D] border-[#1E2D3D] text-foreground placeholder:text-muted-foreground"
                      />
                    </div>
                  </div>
                )}
              </div>
              {(hasEmailChanged || (showPasswordChange && newPassword)) && (
                <div className="space-y-2">
                  <Label htmlFor="current-password" className="text-foreground">Confirm Current Password</Label>
                  <Input
                    id="current-password"
                    name="current-password"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    autoComplete="current-password"
                    className="bg-[#1E2D3D] border-[#1E2D3D] text-foreground placeholder:text-muted-foreground"
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsSettingsOpen(false)}
                className="bg-[#1E2D3D] text-foreground hover:bg-[#2E3D4D] hover:text-foreground"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Saving...' : 'Save changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isLogoutOpen} onOpenChange={setIsLogoutOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon">
            <LogOut className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent className="bg-[#0A1A2F] border-[#1E2D3D]">
          <DialogHeader>
            <DialogTitle className="text-foreground">Sign Out</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Are you sure you want to sign out of your account?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsLogoutOpen(false)}
              className="bg-[#1E2D3D] text-foreground hover:bg-[#2E3D4D] hover:text-foreground"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleSignOut}
            >
              Sign Out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isPasswordMismatchOpen} onOpenChange={setIsPasswordMismatchOpen}>
        <AlertDialogContent className="bg-[#0A1A2F] border-[#1E2D3D]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Check Your New Password</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              The new password and confirmation password don&apos;t match. Please try again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction 
              onClick={() => setIsPasswordMismatchOpen(false)}
              className="bg-[#1E2D3D] text-foreground hover:bg-[#2E3D4D] hover:text-foreground"
            >
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isCurrentPasswordIncorrect} onOpenChange={setIsCurrentPasswordIncorrect}>
        <AlertDialogContent className="bg-[#0A1A2F] border-[#1E2D3D]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Incorrect Password</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              The current password you entered is incorrect. Please try again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction 
              onClick={() => setIsCurrentPasswordIncorrect(false)}
              className="bg-[#1E2D3D] text-foreground hover:bg-[#2E3D4D] hover:text-foreground"
            >
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
} 