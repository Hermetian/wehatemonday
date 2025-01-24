import { redirect } from "next/navigation";
import { supabase } from "@/app/lib/auth/supabase";
import { TeamManagement } from "@/app/components/teams/TeamManagement";

export default async function TeamsPage() {
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.user) {
    redirect("/auth/signin");
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Team Management</h1>
      </div>
      <TeamManagement />
    </div>
  );
} 