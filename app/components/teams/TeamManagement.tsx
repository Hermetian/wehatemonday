'use client';

import { useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/app/components/ui/dialog";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { trpc } from "@/app/lib/trpc/client";
import { UserRole } from "@prisma/client";

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

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>Create New Team</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Team</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateTeam} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="teamName">Team Name</Label>
                <Input
                  id="teamName"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="Enter team name"
                  required
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
              className="p-4 border rounded-lg shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">{team.name}</h3>
                  <p className="text-sm text-gray-500">
                    {team.members.length} members
                  </p>
                </div>
                <Dialog onOpenChange={(open) => !open && setSelectedTeamId(null)}>
                  <DialogTrigger asChild>
                    <Button 
                      variant="outline"
                      onClick={() => setSelectedTeamId(team.id)}
                    >
                      Manage Members
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Manage Team Members - {team.name}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-6">
                      <div className="space-y-4">
                        <h3 className="font-medium">Current Team Members</h3>
                        {loadingMembers ? (
                          <div>Loading members...</div>
                        ) : (
                          <div className="space-y-2">
                            {teamMembers?.map((member) => (
                              <div key={member.id} className="flex items-center justify-between p-2 border rounded">
                                <div>
                                  <p className="font-medium">{member.name}</p>
                                  <p className="text-sm text-gray-500">{member.email}</p>
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
                        <h3 className="font-medium">Add Team Members</h3>
                        <div className="space-y-2">
                          <Label>Filter by Role</Label>
                          <Select value={selectedRole} onValueChange={(value) => setSelectedRole(value as UserRole)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={UserRole.ADMIN}>Admin</SelectItem>
                              <SelectItem value={UserRole.MANAGER}>Manager</SelectItem>
                              <SelectItem value={UserRole.AGENT}>Agent</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Search Users</Label>
                          <Input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search by name or email"
                          />
                        </div>

                        {loadingUsers ? (
                          <div>Loading users...</div>
                        ) : (
                          <div className="space-y-2">
                            {eligibleUsers?.map((user) => (
                              <div key={user.id} className="flex items-center justify-between p-2 border rounded">
                                <div>
                                  <p className="font-medium">{user.name}</p>
                                  <p className="text-sm text-gray-500">{user.email}</p>
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleAddMember(user.id)}
                                  disabled={addMember.isLoading}
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
    </div>
  );
} 