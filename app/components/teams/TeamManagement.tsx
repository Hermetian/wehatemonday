'use client';

import { useState, useRef, useEffect } from "react";
import { Button } from "@/app/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/app/components/ui/dialog";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { trpc } from "@/app/lib/trpc/client";
import { Role, VALID_ROLES } from "@/app/types/auth";
import { useAuth } from "@/app/lib/auth/AuthContext";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/app/components/ui/alert-dialog";
import { StatusBadge } from "@/app/components/ui/status-badge";

// Simplified types to avoid deep type instantiation
type BasicUser = {
  id: string;
  name: string | null;
  email: string;
  role: Role;
};

type BasicTeam = {
  id: string;
  name: string;
  members: BasicUser[];
  tags: string[];
};

export function TeamManagement() {
  const { role } = useAuth();
  const isManager = role === 'MANAGER' || role === 'ADMIN';

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isTeamDialogOpen, setIsTeamDialogOpen] = useState(false);
  const [selected_team_id, setSelectedTeamId] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<Role>(VALID_ROLES[2]);
  const [searchQuery, setSearchQuery] = useState("");
  const [teamName, setTeamName] = useState("");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [newTag, setNewTag] = useState("");
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const tagSuggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        tagSuggestionsRef.current &&
        !tagSuggestionsRef.current.contains(event.target as Node) &&
        !tagInputRef.current?.contains(event.target as Node)
      ) {
        setShowTagSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const utils = trpc.useContext();
  const { data: teams, isLoading: loadingTeams } = trpc.team.list.useQuery() as { data: BasicTeam[] | undefined, isLoading: boolean };
  const { data: teamMembers, isLoading: loadingMembers } = trpc.team.getMembers.useQuery(
    { teamId: selected_team_id! },
    { enabled: !!selected_team_id }
  ) as { data: { user: BasicUser }[] | undefined, isLoading: boolean };
  const { data: eligibleUsers, isLoading: loadingUsers } = trpc.user.listByRole.useQuery(
    { role: selectedRole, searchQuery },
    { enabled: !!selected_team_id }
  ) as { data: BasicUser[] | undefined, isLoading: boolean };
  const { data: availableTags = [] } = trpc.ticket.getAllTags.useQuery();

  const createTeam = trpc.team.create.useMutation({
    onSuccess: () => {
      utils.team.list.invalidate();
      setIsCreateDialogOpen(false);
      setTeamName("");
    },
  });

  const addMember = trpc.team.addMember.useMutation({
    onSuccess: () => {
      utils.team.getMembers.invalidate({ teamId: selected_team_id! });
    }
  });

  const removeMember = trpc.team.removeMember.useMutation({
    onSuccess: () => {
      utils.team.getMembers.invalidate({ teamId: selected_team_id! });
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

  const addTags = trpc.team.addTags.useMutation({
    onMutate: async ({ teamId, tags }) => {
      // Cancel outgoing refetches
      await utils.team.list.cancel();
      
      // Snapshot the previous value
      const previousTeams = utils.team.list.getData();
      
      // Optimistically update the team
      utils.team.list.setData(undefined, (old) => {
        if (!old) return old;
        return old.map(team => {
          if (team.id === teamId) {
            return {
              ...team,
              tags: [...new Set([...team.tags, ...tags])] // Ensure uniqueness
            };
          }
          return team;
        });
      });

      return { previousTeams };
    },
    onError: (err, variables, context) => {
      // If the mutation fails, use the context we returned above
      if (context?.previousTeams) {
        utils.team.list.setData(undefined, context.previousTeams);
      }
    },
    onSettled: () => {
      // Sync with server
      utils.team.list.invalidate();
    }
  });

  const removeTags = trpc.team.removeTags.useMutation({
    onMutate: async ({ teamId, tags }) => {
      await utils.team.list.cancel();
      
      const previousTeams = utils.team.list.getData();
      
      utils.team.list.setData(undefined, (old) => {
        if (!old) return old;
        return old.map(team => {
          if (team.id === teamId) {
            return {
              ...team,
              tags: team.tags.filter((tag: string) => !tags.includes(tag))
            };
          }
          return team;
        });
      });

      return { previousTeams };
    },
    onError: (err, variables, context) => {
      if (context?.previousTeams) {
        utils.team.list.setData(undefined, context.previousTeams);
      }
    },
    onSettled: () => {
      utils.team.list.invalidate();
    }
  });

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) return;
    await createTeam.mutate({ name: teamName });
  };

  const handleAddMember = async (userId: string) => {
    if (!selected_team_id) return;
    await addMember.mutate({ teamId: selected_team_id, userId });
  };

  const handleRemoveMember = async (userId: string) => {
    if (!selected_team_id) return;
    await removeMember.mutate({ teamId: selected_team_id, userId });
  };

  const handleDeleteTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected_team_id) return;
    await deleteTeam.mutate(selected_team_id);
  };

  const handleAddTag = async (tag: string) => {
    if (!selected_team_id) return;
    
    // Check if tag already exists in the selected team
    const selectedTeam = teams?.find(t => t.id === selected_team_id);
    if (selectedTeam?.tags.includes(tag)) return;
    
    await addTags.mutate({ teamId: selected_team_id, tags: [tag] });
  };

  const handleRemoveTag = async (tag: string) => {
    if (!selected_team_id) return;
    await removeTags.mutate({ teamId: selected_team_id, tags: [tag] });
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault(); // Prevent form submission
      if (newTag.trim()) {
        handleAddTag(newTag.trim());
        setNewTag("");
        setShowTagSuggestions(false);
      }
    } else if (e.key === 'Escape') {
      setShowTagSuggestions(false);
    } else if (e.key === 'ArrowDown' && showTagSuggestions && filteredTags.length > 0) {
      e.preventDefault();
      const suggestionsList = document.querySelector('#tag-suggestions');
      const firstSuggestion = suggestionsList?.querySelector('button');
      (firstSuggestion as HTMLButtonElement)?.focus();
    }
  };

  const handleTagSuggestionKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, tag: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleAddTag(tag);
      setNewTag("");
      setShowTagSuggestions(false);
      tagInputRef.current?.focus();
    } else if (e.key === 'Escape') {
      setShowTagSuggestions(false);
      tagInputRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextSibling = e.currentTarget.nextElementSibling as HTMLButtonElement;
      if (nextSibling) nextSibling.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevSibling = e.currentTarget.previousElementSibling as HTMLButtonElement;
      if (prevSibling) prevSibling.focus();
      else {
        tagInputRef.current?.focus();
      }
    }
  };

  const filteredEligibleUsers = eligibleUsers?.filter(user => 
    !teamMembers?.some(member => member.user.id === user.id)
  );

  const filteredTags = availableTags
    .filter(tag => {
      const selectedTeam = teams?.find(t => t.id === selected_team_id);
      return tag.toLowerCase().includes(newTag.toLowerCase()) && 
        (!selectedTeam || !selectedTeam.tags.includes(tag));
    })
    .slice(0, 5); // Limit to 5 suggestions

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Teams</h2>
        {isManager && (
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            Create New Team
          </Button>
        )}
      </div>

      <div className="grid gap-4">
        {loadingTeams ? (
          <div>Loading teams...</div>
        ) : teams?.length === 0 ? (
          <div>No teams found.</div>
        ) : (
          teams?.map((team) => (
            <div
              key={team.id}
              className="p-4 rounded-lg border border-[#1E2D3D] bg-[#1E2D3D] space-y-4"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">{team.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {team.members.length} member{team.members.length !== 1 ? 's' : ''}
                  </p>
                </div>
                {isManager && (
                  <div className="space-x-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSelectedTeamId(team.id);
                        setIsTeamDialogOpen(true);
                      }}
                      className="bg-blue-500 hover:bg-blue-600 text-white border-0 transition-colors"
                    >
                      Manage Team
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => {
                        setSelectedTeamId(team.id);
                        setIsDeleteDialogOpen(true);
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                )}
              </div>

              {/* Show team members */}
              <div className="space-y-2">
                {team.members.map((member) => (
                  <div 
                    key={`${team.id}-member-${member.id}`}
                    className="flex items-center space-x-2 text-sm text-muted-foreground"
                  >
                    <span>{member.name || member.email}</span>
                    <StatusBadge role={member.role} className="uppercase">
                      {member.role}
                    </StatusBadge>
                  </div>
                ))}
              </div>

              {/* Show team tags */}
              {team.tags && team.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {team.tags.map((tag, index) => (
                    <span
                      key={`${team.id}-tag-${index}`}
                      className="px-2 py-1 text-sm rounded-full bg-[#0A1A2F] text-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Only render management dialogs for managers */}
      {isManager && (
        <>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
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

          <Dialog open={isTeamDialogOpen} onOpenChange={setIsTeamDialogOpen}>
            <DialogContent className="max-w-2xl bg-[#0A1A2F] border-[#1E2D3D]">
              <DialogHeader>
                <DialogTitle className="text-foreground">Manage Team</DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  Manage team members and settings
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="font-medium text-foreground">Team Tags</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {teams?.find(t => t.id === selected_team_id)?.tags?.map((tag) => (
                      <div 
                        key={`team-tag-${selected_team_id}-${tag}`}
                        className="flex items-center gap-1 px-2 py-1 bg-[#1E2D3D] rounded-full text-sm"
                      >
                        <span className="text-foreground">{tag}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0 hover:bg-[#2E3D4D]"
                          onClick={() => handleRemoveTag(tag)}
                        >
                          <span className="text-muted-foreground">×</span>
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        ref={tagInputRef}
                        value={newTag}
                        onChange={(e) => {
                          setNewTag(e.target.value);
                          setShowTagSuggestions(true);
                        }}
                        onFocus={() => setShowTagSuggestions(true)}
                        onKeyDown={handleTagKeyDown}
                        placeholder="Add new tag"
                        className="w-full bg-[#1E2D3D] border-[#1E2D3D] text-foreground"
                      />
                      {showTagSuggestions && filteredTags.length > 0 && (
                        <div 
                          ref={tagSuggestionsRef}
                          id="tag-suggestions"
                          className="absolute z-50 w-full mt-1 bg-[#1E2D3D] border border-[#2E3D4D] rounded-md shadow-lg overflow-hidden"
                        >
                          {filteredTags.map((tag) => (
                            <button
                              key={`tag-suggestion-${tag}`}
                              onClick={() => {
                                handleAddTag(tag);
                                setNewTag("");
                                setShowTagSuggestions(false);
                                tagInputRef.current?.focus();
                              }}
                              onKeyDown={(e) => handleTagSuggestionKeyDown(e, tag)}
                              className="w-full px-4 py-2 text-left text-foreground hover:bg-[#2E3D4D] focus:bg-[#2E3D4D] focus:outline-none"
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button 
                      onClick={() => {
                        if (newTag.trim()) {
                          handleAddTag(newTag.trim());
                          setNewTag("");
                          setShowTagSuggestions(false);
                        }
                      }}
                      disabled={!newTag.trim()}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      Add Tag
                    </Button>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="font-medium text-foreground">Current Team Members</h3>
                  </div>
                  {loadingMembers ? (
                    <div className="text-foreground">Loading members...</div>
                  ) : (
                    <div className="space-y-2">
                      {teamMembers?.map((member) => (
                        <div 
                          key={member.user.id}
                          className="flex items-center justify-between py-2"
                        >
                          <div className="flex items-center space-x-2">
                            <span className="text-sm text-foreground">
                              {member.user.name || member.user.email}
                            </span>
                            <StatusBadge role={member.user.role} className="uppercase">
                              {member.user.role}
                            </StatusBadge>
                          </div>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleRemoveMember(member.user.id)}
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
                    <Select value={selectedRole} onValueChange={(value) => setSelectedRole(value as Role)}>
                      <SelectTrigger className="bg-[#0A1A2F] border-[#1E2D3D] text-foreground">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#0A1A2F] border-[#1E2D3D]">
                        {VALID_ROLES.map((role) => (
                          <SelectItem
                            key={role}
                            value={role}
                            className="text-foreground hover:bg-[#1E2D3D] flex items-center justify-center"
                          >
                            <StatusBadge role={role} className="uppercase">
                              {role}
                            </StatusBadge>
                          </SelectItem>
                        ))}
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
                        <div 
                          key={`eligible-user-${user.id}`} 
                          className="flex items-center justify-between p-2 border border-[#1E2D3D] rounded bg-[#1E2D3D]"
                        >
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

                <div className="pt-6 border-t border-[#1E2D3D]">
                  <Button 
                    variant="destructive" 
                    onClick={() => setIsDeleteDialogOpen(true)}
                    className="w-full"
                  >
                    Delete Team
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

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
        </>
      )}
    </div>
  );
}