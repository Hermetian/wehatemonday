'use client';

import { useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/app/components/ui/dialog";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { trpc } from "@/app/lib/trpc/client";
import { UserRole } from "@prisma/client";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/app/components/ui/alert-dialog";

// Simplified types to avoid deep type instantiation
type BasicUser = {
  id: string;
  name: string | null;
  email: string;
  role: UserRole;
};

type BasicTeam = {
  id: string;
  name: string;
  members: BasicUser[];
};

export function TeamManagement() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<UserRole>(UserRole.AGENT);
  const [searchQuery, setSearchQuery] = useState("");
  const [teamName, setTeamName] = useState("");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const utils = trpc.useContext();
  const { data: teams, isLoading: loadingTeams } = trpc.team.list.useQuery() as { data: BasicTeam[] | undefined, isLoading: boolean };
  const { data: teamMembers, isLoading: loadingMembers } = trpc.team.getMembers.useQuery(
    { teamId: selectedTeamId! },
    { enabled: !!selectedTeamId }
  ) as { data: BasicUser[] | undefined, isLoading: boolean };
  const { data: eligibleUsers, isLoading: loadingUsers } = trpc.user.listByRole.useQuery(
    { role: selectedRole, searchQuery },
    { enabled: !!selectedTeamId }
  ) as { data: BasicUser[] | undefined, isLoading: boolean };

  const createTeam = trpc.team.create.useMutation({
    onSuccess: () => {
      utils.team.list.invalidate();
      setIsCreateDialogOpen(false);
      setTeamName("");
    },
  });

  const addMember = trpc.team.addMember.useMutation({
    onSuccess: () => {
      utils.team.getMembers.invalidate({ teamId: selectedTeamId! });
    }
  });

  const removeMember = trpc.team.removeMember.useMutation({
    onSuccess: () => {
      utils.team.getMembers.invalidate({ teamId: selectedTeamId! });
    }
  });

  const deleteTeam = trpc.team.delete.useMutation({
    onSuccess: () => {
      utils.team.list.invalidate();
      setSelectedTeamId(null);
      setIsDeleteDialogOpen(false);
      setDeletePassword("");
      setDeleteError(null);
    },
    onError: (error) => {
      setDeleteError(error.message);
    }
  });

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) return;
    await createTeam.mutate({ name: teamName });
  };

  const handleAddMember = async (userId: string) => {
    if (!selectedTeamId) return;
    await addMember.mutate({ teamId: selectedTeamId, userId });
  };

  const handleRemoveMember = async (userId: string) => {
    if (!selectedTeamId) return;
    await removeMember.mutate({ teamId: selectedTeamId, userId });
  };

  const handleDeleteTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeamId || !deletePassword) return;
    await deleteTeam.mutate({ teamId: selectedTeamId, password: deletePassword });
  };

  // Filter out current team members from eligible users
  const filteredEligibleUsers = eligibleUsers?.filter(user => 
    !teamMembers?.some(member => member.id === user.id)
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>Create New Team</Button>
          </DialogTrigger>
          <DialogContent className="bg-[#0A1A2F] border-[#1E2D3D]">
            <DialogHeader>
              <DialogTitle className="text-foreground">Create New Team</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateTeam} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="teamName" className="text-foreground">Team Name</Label>
                <Input
                  id="teamName"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="Enter team name"
                  required
                  className="bg-[#1E2D3D] border-[#1E2D3D] text-foreground"
                />
              </div>
              <Button 
                type="submit" 
                className="w-full"
                disabled={createTeam.isLoading}
              >
                {createTeam.isLoading ? "Creating..." : "Create Team"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loadingTeams ? (
        <div>Loading teams...</div>
      ) : !teams?.length ? (
        <div>No teams found. Create your first team to get started!</div>
      ) : (
        <div className="space-y-4">
          {teams.map((team) => (
            <div
              key={team.id}
              className="p-4 border rounded-lg shadow-sm hover:shadow-md transition-shadow bg-background"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">{team.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {team.members.length} members
                  </p>
                </div>
                <Dialog onOpenChange={(open) => !open && setSelectedTeamId(null)}>
                  <DialogTrigger asChild>
                    <Button 
                      variant="outline"
                      onClick={() => setSelectedTeamId(team.id)}
                    >
                      Manage Team
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl bg-[#0A1A2F] border-[#1E2D3D]">
                    <DialogHeader>
                      <DialogTitle className="text-foreground">Manage Team - {team.name}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-6">
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <h3 className="font-medium text-foreground">Current Team Members</h3>
                          <Button 
                            variant="destructive" 
                            size="sm"
                            onClick={() => setIsDeleteDialogOpen(true)}
                          >
                            Delete Team
                          </Button>
                        </div>
                        {loadingMembers ? (
                          <div className="text-foreground">Loading members...</div>
                        ) : (
                          <div className="space-y-2">
                            {teamMembers?.map((member) => (
                              <div key={member.id} className="flex items-center justify-between p-2 border border-[#1E2D3D] rounded bg-[#1E2D3D]">
                                <div>
                                  <p className="font-medium text-foreground">{member.name}</p>
                                  <p className="text-sm text-muted-foreground">{member.email}</p>
                                </div>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => handleRemoveMember(member.id)}
                                  disabled={removeMember.isLoading}
                                >
                                  Remove
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="space-y-4">
                        <h3 className="font-medium text-foreground">Add Team Members</h3>
                        <div className="space-y-2">
                          <Label className="text-foreground">Filter by Role</Label>
                          <Select value={selectedRole} onValueChange={(value) => setSelectedRole(value as UserRole)}>
                            <SelectTrigger className="bg-[#1E2D3D] border-[#1E2D3D] text-foreground">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-[#1E2D3D] border-[#1E2D3D]">
                              <SelectItem value={UserRole.ADMIN} className="text-foreground hover:bg-[#0A1A2F]">Admin</SelectItem>
                              <SelectItem value={UserRole.MANAGER} className="text-foreground hover:bg-[#0A1A2F]">Manager</SelectItem>
                              <SelectItem value={UserRole.AGENT} className="text-foreground hover:bg-[#0A1A2F]">Agent</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-foreground">Search Users</Label>
                          <Input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search by name or email"
                            className="bg-[#1E2D3D] border-[#1E2D3D] text-foreground placeholder:text-muted-foreground"
                          />
                        </div>

                        {loadingUsers ? (
                          <div className="text-foreground">Loading users...</div>
                        ) : (
                          <div className="space-y-2">
                            {filteredEligibleUsers?.map((user) => (
                              <div key={user.id} className="flex items-center justify-between p-2 border border-[#1E2D3D] rounded bg-[#1E2D3D]">
                                <div>
                                  <p className="font-medium text-foreground">{user.name}</p>
                                  <p className="text-sm text-muted-foreground">{user.email}</p>
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleAddMember(user.id)}
                                  disabled={addMember.isLoading}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white border-0"
                                >
                                  Add to Team
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="bg-[#0A1A2F] border-[#1E2D3D]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Delete Team</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This action cannot be undone. Please enter your password to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form onSubmit={handleDeleteTeam} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground">Password</Label>
              <Input
                id="password"
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Enter your password"
                required
                className="bg-[#1E2D3D] border-[#1E2D3D] text-foreground"
              />
              {deleteError && (
                <p className="text-sm text-destructive">{deleteError}</p>
              )}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel 
                onClick={() => {
                  setDeletePassword("");
                  setDeleteError(null);
                }}
                className="bg-[#1E2D3D] text-foreground hover:bg-[#2E3D4D] hover:text-foreground"
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction asChild>
                <Button 
                  type="submit"
                  variant="destructive"
                  disabled={deleteTeam.isLoading || !deletePassword}
                >
                  {deleteTeam.isLoading ? "Deleting..." : "Delete Team"}
                </Button>
              </AlertDialogAction>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
} 