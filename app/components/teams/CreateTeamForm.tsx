'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { trpc } from "@/app/lib/trpc/client";

interface CreateTeamFormProps {
  onSuccess: () => void;
}

export function CreateTeamForm({ onSuccess }: CreateTeamFormProps) {
  const [teamName, setTeamName] = useState("");
  const [initialTag, setInitialTag] = useState("");
  const router = useRouter();
  
  const createTeam = trpc.team.create.useMutation({
    onSuccess: () => {
      router.refresh();
      onSuccess();
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) return;
    
    await createTeam.mutate({ 
      name: teamName,
      tags: initialTag.trim() ? [initialTag.trim()] : []
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
      <div className="space-y-2">
        <Label htmlFor="initialTag">Initial Tag (Optional)</Label>
        <Input
          id="initialTag"
          value={initialTag}
          onChange={(e) => setInitialTag(e.target.value)}
          placeholder="Enter initial tag"
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
  );
} 