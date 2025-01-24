import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../trpc";
import { UserRole } from "@prisma/client";

const TeamMemberOutput = {
  id: true,
  name: true,
  email: true,
  role: true,
} as const;

const TeamOutput = {
  id: true,
  name: true,
  members: {
    select: TeamMemberOutput,
    take: 50, // Limit to prevent deep type instantiation
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
  members: TeamMember[];
};

export const teamRouter = router({
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
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
}); 