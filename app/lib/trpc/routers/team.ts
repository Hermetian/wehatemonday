import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../trpc";
import { createAuditLog } from "@/app/lib/utils/audit-logger";
import { Role } from '@/app/types/auth';

export type TeamMember = {
  id: string;
  name: string | null;
  email: string;
  role: Role;
};

export type Team = {
  id: string;
  name: string;
  tags: string[];
  members: TeamMember[];
};

type TeamMemberWithUser = {
  team_id: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    role: Role;
  };
};

export const teamRouter = router({
  simpleTest: protectedProcedure
    .query(async ({ ctx }) => {
      try {
        console.log('Simple test: Starting');
        console.log('Simple test: Context:', {
          hasUser: !!ctx.user,
          userEmail: ctx.user?.email,
          userRole: ctx.user?.role,
          hasSupabase: !!ctx.supabase
        });

        if (!ctx.user) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'No user in context',
          });
        }

        return {
          ok: true,
          message: "Hello from TRPC",
          timestamp: new Date().toISOString(),
          user: {
            email: ctx.user.email,
            role: ctx.user.role
          }
        };
      } catch (error) {
        console.error('Simple test error:', error);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error in simple test',
          cause: error,
        });
      }
    }),

  testUsers: protectedProcedure
    .query(async ({ ctx }) => {
      try {
        console.log('Test procedure: Starting');
        console.log('Test procedure: Context:', {
          hasUser: !!ctx.user,
          userEmail: ctx.user?.email,
          userRole: ctx.user?.role,
          hasSupabase: !!ctx.supabase
        });
        
        if (!ctx.supabase) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "No Supabase client in context",
          });
        }

        if (!ctx.user) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "No user in context",
          });
        }

        console.log('Test procedure: Fetching users');
        const { data: users, error, status, statusText } = await ctx.supabase
          .from('users')
          .select('id, email, name, role')
          .limit(10);

        console.log('Test procedure: Query result:', {
          hasData: !!users,
          dataLength: users?.length,
          hasError: !!error,
          status,
          statusText
        });

        if (error) {
          console.error('Test procedure error:', error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Test failed: ${error.message}`,
            cause: error,
          });
        }

        if (!users) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "No data returned from query",
          });
        }

        console.log('Test procedure success, found users:', users.length);
        return {
          success: true,
          users,
          currentUserRole: ctx.user.role,
          debug: {
            userEmail: ctx.user.email,
            timestamp: new Date().toISOString()
          }
        };
      } catch (error) {
        console.error('Test procedure caught error:', error);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Unknown error occurred",
          cause: error,
        });
      }
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string(),
        tags: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        if (ctx.user?.role !== 'ADMIN' && ctx.user?.role !== 'MANAGER') {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only managers and admins can create teams",
          });
        }

        const { data: team, error } = await ctx.supabase
          .from('teams')
          .insert([{
            name: input.name,
            tags: input.tags || []
          }])
          .select()
          .single();

        if (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create team",
            cause: error,
          });
        }

        await createAuditLog({
          action: 'CREATE',
          entity: 'TEAM',
          entityId: team.id,
          userId: ctx.user.id,
          oldData: null,
          newData: team,
          supabase: ctx.supabase
        });

        return team;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create team",
          cause: error,
        });
      }
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        tags: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        if (ctx.user?.role !== 'MANAGER' && ctx.user?.role !== 'ADMIN') {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only managers and admins can update teams",
          });
        }

        const { data: existingTeam, error: fetchError } = await ctx.supabase
          .from('teams')
          .select()
          .eq('id', input.id)
          .single();

        if (fetchError || !existingTeam) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Team not found",
          });
        }

        const { data: updatedTeam, error: updateError } = await ctx.supabase
          .from('teams')
          .update({
            name: input.name,
            tags: input.tags
          })
          .eq('id', input.id)
          .select()
          .single();

        if (updateError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to update team",
            cause: updateError,
          });
        }

        await createAuditLog({
          action: 'UPDATE',
          entity: 'TEAM',
          entityId: input.id,
          userId: ctx.user.id,
          oldData: existingTeam,
          newData: updatedTeam,
          supabase: ctx.supabase
        });

        return updatedTeam;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update team",
          cause: error,
        });
      }
    }),

  delete: protectedProcedure
    .input(z.string())
    .mutation(async ({ input: teamId, ctx }) => {
      try {
        if (ctx.user?.role !== 'MANAGER' && ctx.user?.role !== 'ADMIN') {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only managers and admins can delete teams",
          });
        }

        const { data: existingTeam, error: fetchError } = await ctx.supabase
          .from('teams')
          .select()
          .eq('id', teamId)
          .single();

        if (fetchError || !existingTeam) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Team not found",
          });
        }

        const { error: deleteError } = await ctx.supabase
          .from('teams')
          .delete()
          .eq('id', teamId);

        if (deleteError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to delete team",
            cause: deleteError,
          });
        }

        await createAuditLog({
          action: 'DELETE',
          entity: 'TEAM',
          entityId: teamId,
          userId: ctx.user.id,
          oldData: existingTeam,
          newData: {},
          supabase: ctx.supabase
        });

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete team",
          cause: error,
        });
      }
    }),

  list: protectedProcedure
    .query(async ({ ctx }) => {
      try {
        // First, get all teams
        const { data: teams, error: teamsError } = await ctx.supabase
          .from('teams')
          .select(`
            id,
            name,
            tags
          `);

        if (teamsError) {
          console.error('Error fetching teams:', teamsError);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch teams",
            cause: teamsError,
          });
        }

        if (!teams) {
          return [];
        }

        // Then, get team members for all teams
        const teamIds = teams.map(team => team.id);
        const { data: teamMembers, error: membersError } = await ctx.supabase
          .from('team_members')
          .select(`
            team_id,
            user:users (
              id,
              name,
              email,
              role
            )
          `)
          .in('team_id', teamIds);

        if (membersError) {
          console.error('Error fetching team members:', membersError);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch team members",
            cause: membersError,
          });
        }

        // Group members by team
        const membersByTeam = new Map<string, TeamMember[]>();
        if (teamMembers) {
          for (const member of teamMembers as unknown as TeamMemberWithUser[]) {
            if (!member.user || typeof member.user !== 'object') continue;
            
            const teamId = member.team_id;
            if (!membersByTeam.has(teamId)) {
              membersByTeam.set(teamId, []);
            }
            
            membersByTeam.get(teamId)?.push({
              id: member.user.id,
              name: member.user.name,
              email: member.user.email,
              role: member.user.role
            });
          }
        }

        // Transform the data to match the expected Team type
        return teams.map(team => ({
          id: team.id,
          name: team.name,
          tags: team.tags || [],
          members: (membersByTeam.get(team.id) || [])
            .sort((a, b) => {
              // Sort by role priority: ADMIN > MANAGER > AGENT > CUSTOMER
              const roleOrder = { ADMIN: 0, MANAGER: 1, AGENT: 2, CUSTOMER: 3 };
              return (roleOrder[a.role] || 4) - (roleOrder[b.role] || 4);
            })
        }));

      } catch (error) {
        console.error('Error in team.list:', error);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch teams",
          cause: error,
        });
      }
    }),

  getMembers: protectedProcedure
    .input(z.object({
      teamId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        if (ctx.user?.role !== 'MANAGER' && ctx.user?.role !== 'ADMIN') {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only managers and admins can view team members",
          });
        }

        const { data: members, error } = await ctx.supabase
          .from('team_members')
          .select(`
            team_id,
            user:users (
              id,
              name,
              email,
              role
            )
          `)
          .eq('team_id', input.teamId)
          .order('user(role)', { ascending: true })
          .limit(50);

        if (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch team members",
            cause: error,
          });
        }

        if (!members) {
          return [];
        }

        return members;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch team members",
          cause: error,
        });
      }
    }),

  addMember: protectedProcedure
    .input(z.object({
      teamId: z.string(),
      userId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        if (ctx.user?.role !== 'MANAGER' && ctx.user?.role !== 'ADMIN') {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only managers and admins can add team members",
          });
        }

        // Add team member
        const { data: teamMember, error } = await ctx.supabase
          .from('team_members')
          .insert([{
            team_id: input.teamId,
            user_id: input.userId,
            created_at: new Date().toISOString(),
          }])
          .select(`
            id,
            team_id,
            user_id,
            role,
            created_at,
            updated_at,
            user:user_id(
              id,
              name,
              email,
              role
            )
          `)
          .single();

        if (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to add team member",
            cause: error,
          });
        }

        return teamMember;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to add team member",
          cause: error,
        });
      }
    }),

  removeMember: protectedProcedure
    .input(z.object({
      teamId: z.string(),
      userId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        if (ctx.user?.role !== 'MANAGER' && ctx.user?.role !== 'ADMIN') {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only managers and admins can remove team members",
          });
        }

        // Remove team member
        const { data: teamMember, error } = await ctx.supabase
          .from('team_members')
          .delete()
          .match({ team_id: input.teamId, user_id: input.userId })
          .select()
          .single();

        if (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to remove team member",
            cause: error,
          });
        }

        return teamMember;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to remove team member",
          cause: error,
        });
      }
    }),

  addTags: protectedProcedure
    .input(z.object({
      teamId: z.string(),
      tags: z.array(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        if (ctx.user?.role !== 'MANAGER' && ctx.user?.role !== 'ADMIN') {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only managers and admins can add team tags",
          });
        }

        // Get current team tags
        const { data: team, error: fetchError } = await ctx.supabase
          .from('teams')
          .select('tags')
          .eq('id', input.teamId)
          .single();

        if (fetchError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch team",
            cause: fetchError,
          });
        }

        // Combine existing and new tags, removing duplicates
        const currentTags = team?.tags || [];
        const newTags = [...new Set([...currentTags, ...input.tags])];

        // Update team tags
        const { data: updatedTeam, error: updateError } = await ctx.supabase
          .from('teams')
          .update({ tags: newTags })
          .eq('id', input.teamId)
          .select()
          .single();

        if (updateError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to update team tags",
            cause: updateError,
          });
        }

        return updatedTeam;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to add team tags",
          cause: error,
        });
      }
    }),

  removeTags: protectedProcedure
    .input(z.object({
      teamId: z.string(),
      tags: z.array(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        if (ctx.user?.role !== 'MANAGER' && ctx.user?.role !== 'ADMIN') {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only managers and admins can remove team tags",
          });
        }

        // Get current team tags
        const { data: team, error: fetchError } = await ctx.supabase
          .from('teams')
          .select('tags')
          .eq('id', input.teamId)
          .single();

        if (fetchError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch team",
            cause: fetchError,
          });
        }

        // Filter out tags to remove
        const updatedTags = (team?.tags || []).filter((tag: string) => !input.tags.includes(tag));

        // Update team tags
        const { data: updatedTeam, error: updateError } = await ctx.supabase
          .from('teams')
          .update({ tags: updatedTags })
          .eq('id', input.teamId)
          .select()
          .single();

        if (updateError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to update team tags",
            cause: updateError,
          });
        }

        return updatedTeam;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to remove team tags",
          cause: error,
        });
      }
    }),

  getUserTeamTags: protectedProcedure
    .query(async ({ ctx }) => {
      try {
        // First get the teams where the user is a member
        const { data: teamMembers, error: memberError } = await ctx.supabase
          .from('team_members')
          .select('team_id')
          .eq('user_id', ctx.user.id);

        if (memberError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch team memberships",
            cause: memberError,
          });
        }

        if (!teamMembers || teamMembers.length === 0) {
          return [];
        }

        // Then get the tags for all these teams
        const teamIds = teamMembers.map(tm => tm.team_id);
        const { data: teams, error } = await ctx.supabase
          .from('teams')
          .select('tags')
          .in('id', teamIds);

        if (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch team tags",
            cause: error,
          });
        }

        // Get unique tags from all teams
        const tagSet = new Set<string>();
        teams?.forEach((team: { tags: string[] | null }) => {
          if (Array.isArray(team.tags)) {
            team.tags.forEach((tag: string) => tag && tagSet.add(tag));
          }
        });

        return Array.from(tagSet).sort();
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch team tags",
          cause: error,
        });
      }
    }),
}); 