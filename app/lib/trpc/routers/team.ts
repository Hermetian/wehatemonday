import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../trpc";
import { UserRole } from "@prisma/client";
import { createAuditLog } from "@/app/lib/utils/audit-logger";
import { supabase } from "@/app/lib/auth/supabase";

const TeamMemberOutput = {
  id: true,
  name: true,
  email: true,
  role: true,
} as const;

const TeamOutput = {
  id: true,
  name: true,
  tags: true,
  members: {
    select: TeamMemberOutput,
  }
} as const;

export type TeamMember = {
  id: string;
  name: string | null;
  email: string;
  role: UserRole;
};

export type Team = {
  id: string;
  name: string;
  tags: string[];
  members: TeamMember[];
};

export const teamRouter = router({
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      tags: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.role !== UserRole.MANAGER && ctx.user?.role !== UserRole.ADMIN) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only managers and admins can create teams",
        });
      }

      const team = await ctx.prisma.team.create({
        data: {
          name: input.name,
          tags: input.tags || [],
          members: {
            connect: { id: ctx.user.id },
          },
        },
        select: TeamOutput,
      });

      return team;
    }),

  list: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user?.role !== UserRole.MANAGER && ctx.user?.role !== UserRole.ADMIN) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only managers and admins can view teams",
        });
      }

      const teams = await ctx.prisma.team.findMany({
        take: 50, // Limit to prevent deep type instantiation
        select: TeamOutput,
      });

      return teams;
    }),

  getMembers: protectedProcedure
    .input(z.object({
      teamId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      if (ctx.user?.role !== UserRole.MANAGER && ctx.user?.role !== UserRole.ADMIN) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only managers and admins can view team members",
        });
      }

      const team = await ctx.prisma.team.findUnique({
        where: { id: input.teamId },
        select: {
          members: {
            select: TeamMemberOutput,
            take: 50, // Limit to prevent deep type instantiation
          }
        },
      });

      if (!team) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Team not found",
        });
      }

      return team.members;
    }),

  addMember: protectedProcedure
    .input(z.object({
      teamId: z.string(),
      userId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.role !== UserRole.MANAGER && ctx.user?.role !== UserRole.ADMIN) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only managers and admins can add team members",
        });
      }

      const team = await ctx.prisma.team.update({
        where: { id: input.teamId },
        data: {
          members: {
            connect: { id: input.userId },
          },
        },
        select: TeamOutput,
      });

      return team;
    }),

  removeMember: protectedProcedure
    .input(z.object({
      teamId: z.string(),
      userId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.role !== UserRole.MANAGER && ctx.user?.role !== UserRole.ADMIN) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only managers and admins can remove team members",
        });
      }

      const team = await ctx.prisma.team.update({
        where: { id: input.teamId },
        data: {
          members: {
            disconnect: { id: input.userId },
          },
        },
        select: TeamOutput,
      });

      return team;
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      tags: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.role !== UserRole.MANAGER && ctx.user?.role !== UserRole.ADMIN) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only managers and admins can update teams",
        });
      }

      const team = await ctx.prisma.team.update({
        where: { id: input.id },
        data: {
          ...(input.name && { name: input.name }),
          ...(input.tags && { tags: input.tags }),
        },
        select: TeamOutput,
      });

      return team;
    }),

  addTags: protectedProcedure
    .input(z.object({
      teamId: z.string(),
      tags: z.array(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.role !== UserRole.MANAGER && ctx.user?.role !== UserRole.ADMIN) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only managers and admins can add team tags",
        });
      }

      const team = await ctx.prisma.team.update({
        where: { id: input.teamId },
        data: {
          tags: {
            push: input.tags,
          },
        },
        select: TeamOutput,
      });

      return team;
    }),

  removeTags: protectedProcedure
    .input(z.object({
      teamId: z.string(),
      tags: z.array(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.role !== UserRole.MANAGER && ctx.user?.role !== UserRole.ADMIN) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only managers and admins can remove team tags",
        });
      }

      const team = await ctx.prisma.team.findUnique({
        where: { id: input.teamId },
        select: { tags: true },
      }) as { tags: string[] } | null;

      if (!team) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Team not found",
        });
      }

      const updatedTags = team.tags.filter((tag: string) => !input.tags.includes(tag));

      const updatedTeam = await ctx.prisma.team.update({
        where: { id: input.teamId },
        data: {
          tags: updatedTags,
        },
        select: TeamOutput,
      });

      return updatedTeam;
    }),

  delete: protectedProcedure
    .input(z.object({
      teamId: z.string(),
      password: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.role !== UserRole.MANAGER && ctx.user?.role !== UserRole.ADMIN) {
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
      const team = await ctx.prisma.team.findUnique({
        where: { id: input.teamId },
        include: {
          members: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
      });

      if (!team) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Team not found",
        });
      }

      // Delete team
      await ctx.prisma.team.delete({
        where: { id: input.teamId },
      });

      // Create audit log
      await createAuditLog({
        action: "DELETE",
        entity: "TEAM",
        entityId: input.teamId,
        userId: ctx.user.id,
        oldData: team,
        newData: {},
        prisma: ctx.prisma,
      });

      return { success: true };
    }),

  getUserTeamTags: protectedProcedure
    .query(async ({ ctx }) => {
      const teams = await ctx.prisma.team.findMany({
        where: {
          members: {
            some: {
              id: ctx.user.id
            }
          }
        },
        select: {
          tags: true
        }
      });

      // Get unique tags from all teams the user is a member of
      const uniqueTags = new Set<string>();
      teams.forEach(team => {
        team.tags.forEach(tag => uniqueTags.add(tag));
      });

      return Array.from(uniqueTags).sort();
    }),
}); 