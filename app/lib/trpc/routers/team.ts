import { router, protectedProcedure } from '@/app/lib/trpc/trpc';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { supabase } from "@/app/lib/auth/supabase";
import { UserClade } from '@/lib/supabase/types';

interface TeamMember {
  id: string;
  name: string | null;
  email: string | null;
  clade: UserClade;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
}

interface Team {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  created_by_id: string;
  tags: string[];
  metadata: Record<string, unknown>;
}

interface TeamWithMembers extends Team {
  members: {
    user: TeamMember;
  }[];
}

export const teamRouter = router({
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      tags: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.clade !== UserClade.MANAGER && ctx.user?.clade !== UserClade.ADMIN) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only managers and admins can create teams",
        });
      }

      // Create team
      const { data: team, error: teamError } = await ctx.supabase
        .from('teams')
        .insert({
          name: input.name,
          tags: input.tags || [],
        })
        .select()
        .single();

      if (teamError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: teamError.message,
        });
      }

      // Add creator as team member
      const { error: memberError } = await ctx.supabase
        .from('team_members')
        .insert({
          team_id: team.id,
          user_id: ctx.user.id,
        });

      if (memberError) {
        // Rollback team creation
        await ctx.supabase
          .from('teams')
          .delete()
          .eq('id', team.id);

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: memberError.message,
        });
      }

      // Get team with members
      const { data: teamWithMembers, error: fetchError } = await ctx.supabase
        .from('teams')
        .select(`
          id,
          name,
          tags,
          members:team_members(
            users(
              id,
              name,
              email,
              clade
            )
          )
        `)
        .eq('id', team.id)
        .single();

      if (fetchError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: fetchError.message,
        });
      }

      return {
        ...teamWithMembers,
        members: teamWithMembers.members.map((m: any) => m.users),
      };
    }),

  list: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        tags: z.array(z.string()).optional(),
        includeUntagged: z.boolean().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      if (ctx.user?.clade !== UserClade.MANAGER && ctx.user?.clade !== UserClade.ADMIN) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only managers and admins can view teams",
        });
      }

      let query = ctx.supabase
        .from('teams')
        .select('*, members:team_members(user:users(*))');

      if (input.search) {
        query = query.or(`name.ilike.%${input.search}%,description.ilike.%${input.search}%`);
      }

      if (input.tags && input.tags.length > 0) {
        query = query.contains('tags', input.tags);
      } else if (input.includeUntagged) {
        query = query.or('tags.eq.{},tags.is.null');
      }

      const { data: teams, error } = await query;

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message,
        });
      }

      return teams as TeamWithMembers[];
    }),

  getMembers: protectedProcedure
    .input(z.object({
      teamId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      if (ctx.user?.clade !== UserClade.MANAGER && ctx.user?.clade !== UserClade.ADMIN) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only managers and admins can view team members",
        });
      }

      const { data: team, error } = await ctx.supabase
        .from('team_members')
        .select(`
          users (
            id,
            name,
            email,
            clade
          )
        `)
        .eq('team_id', input.teamId)
        .limit(50);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return team.map((m: any) => m.users);
    }),

  addMember: protectedProcedure
    .input(z.object({
      teamId: z.string(),
      userId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.clade !== UserClade.MANAGER && ctx.user?.clade !== UserClade.ADMIN) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only managers and admins can add team members",
        });
      }

      const { error } = await ctx.supabase
        .from('team_members')
        .insert({
          team_id: input.teamId,
          user_id: input.userId,
        });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return { success: true };
    }),

  removeMember: protectedProcedure
    .input(z.object({
      teamId: z.string(),
      userId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.clade !== UserClade.MANAGER && ctx.user?.clade !== UserClade.ADMIN) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only managers and admins can remove team members",
        });
      }

      const { error } = await ctx.supabase
        .from('team_members')
        .delete()
        .eq('team_id', input.teamId)
        .eq('user_id', input.userId);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return { success: true };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      tags: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.clade !== UserClade.MANAGER && ctx.user?.clade !== UserClade.ADMIN) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only managers and admins can update teams",
        });
      }

      const { data: team, error: teamError } = await ctx.supabase
        .from('teams')
        .update({
          name: input.name,
          tags: input.tags,
        })
        .eq('id', input.id)
        .select()
        .single();

      if (teamError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: teamError.message,
        });
      }

      // Get team with members
      const { data: teamWithMembers, error: fetchError } = await ctx.supabase
        .from('teams')
        .select(`
          id,
          name,
          tags,
          members:team_members(
            users(
              id,
              name,
              email,
              clade
            )
          )
        `)
        .eq('id', input.id)
        .single();

      if (fetchError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: fetchError.message,
        });
      }

      return {
        ...teamWithMembers,
        members: teamWithMembers.members.map((m: any) => m.users),
      };
    }),

  addTags: protectedProcedure
    .input(z.object({
      teamId: z.string(),
      tags: z.array(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.clade !== UserClade.MANAGER && ctx.user?.clade !== UserClade.ADMIN) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only managers and admins can add team tags",
        });
      }

      const { data: team, error: teamError } = await ctx.supabase
        .from('teams')
        .update({
          tags: {
            ...team.tags,
            ...input.tags,
          },
        })
        .eq('id', input.teamId)
        .select()
        .single();

      if (teamError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: teamError.message,
        });
      }

      // Get team with members
      const { data: teamWithMembers, error: fetchError } = await ctx.supabase
        .from('teams')
        .select(`
          id,
          name,
          tags,
          members:team_members(
            users(
              id,
              name,
              email,
              clade
            )
          )
        `)
        .eq('id', input.teamId)
        .single();

      if (fetchError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: fetchError.message,
        });
      }

      return {
        ...teamWithMembers,
        members: teamWithMembers.members.map((m: any) => m.users),
      };
    }),

  removeTags: protectedProcedure
    .input(z.object({
      teamId: z.string(),
      tags: z.array(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.clade !== UserClade.MANAGER && ctx.user?.clade !== UserClade.ADMIN) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only managers and admins can remove team tags",
        });
      }

      const { data: team, error: teamError } = await ctx.supabase
        .from('teams')
        .update({
          tags: team.tags.filter(tag => !input.tags.includes(tag)),
        })
        .eq('id', input.teamId)
        .select()
        .single();

      if (teamError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: teamError.message,
        });
      }

      // Get team with members
      const { data: teamWithMembers, error: fetchError } = await ctx.supabase
        .from('teams')
        .select(`
          id,
          name,
          tags,
          members:team_members(
            users(
              id,
              name,
              email,
              clade
            )
          )
        `)
        .eq('id', input.teamId)
        .single();

      if (fetchError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: fetchError.message,
        });
      }

      return {
        ...teamWithMembers,
        members: teamWithMembers.members.map((m: any) => m.users),
      };
    }),

  delete: protectedProcedure
    .input(z.object({
      teamId: z.string(),
      password: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.clade !== UserClade.MANAGER && ctx.user?.clade !== UserClade.ADMIN) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only managers and admins can delete teams",
        });
      }

      // Verify password
      const { error } = await supabase.auth.signInWithPassword({
        email: ctx.user.email!,
        password: input.password,
      });

      if (error) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid password",
        });
      }

      // Get team data for audit log
      const { data: team, error: teamError } = await ctx.supabase
        .from('teams')
        .select(`
          id,
          name,
          tags,
          members:team_members(
            users(
              id,
              name,
              email,
              clade
            )
          )
        `)
        .eq('id', input.teamId)
        .single();

      if (teamError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: teamError.message,
        });
      }

      if (!team) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Team not found",
        });
      }

      // Delete team
      const { error: deleteError } = await ctx.supabase
        .from('teams')
        .delete()
        .eq('id', input.teamId);

      if (deleteError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: deleteError.message,
        });
      }

      // Create audit log
      // await createAuditLog({
      //   action: "DELETE",
      //   entity: "TEAM",
      //   entityId: input.teamId,
      //   userId: ctx.user.id,
      //   oldData: team,
      //   newData: {},
      //   prisma: ctx.prisma,
      // });

      return { success: true };
    }),

  getUserTeamTags: protectedProcedure
    .query(async ({ ctx }) => {
      const { data: teams, error } = await ctx.supabase
        .from('teams')
        .select(`
          tags
        `)
        .or(`members.user_id.eq.${ctx.user.id}`);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      // Get unique tags from all teams the user is a member of
      const uniqueTags = new Set<string>();
      teams.forEach(team => {
        team.tags.forEach(tag => uniqueTags.add(tag));
      });

      return Array.from(uniqueTags).sort();
    }),
});